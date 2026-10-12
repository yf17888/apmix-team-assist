import type { AppState, Colleague, EncryptedBlob, Settings, Status, VaultMeta, CurrentTask } from '@/utils/types';
import { DEFAULT_SETTINGS } from '@/utils/types';
import type { Msg, Reply, CsTaskInfo } from '@/utils/messages';
import { parseRoster, normalizeDomains, isAllowed, renderKeyName, settingsReady } from '@/utils/roster';
import { canTransition, ACTIVE, hintFor } from '@/utils/flow';
import { createVault, unlockVault, encrypt, decrypt, exportRaw, importRaw } from '@/utils/vault';
import { LOGIN_URL, KEYS_URL, isApmixUrl, isDashboardUrl } from '@/utils/selectors';
import { testKey } from '@/utils/export';

const local = browser.storage.local;
const session = browser.storage.session;

async function getRoster(): Promise<Colleague[]> {
  return ((await local.get('roster')).roster as Colleague[]) ?? [];
}
async function setRoster(r: Colleague[]) { await local.set({ roster: r }); }
async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await local.get('settings')).settings as Settings | undefined) };
}
async function getTask(): Promise<CurrentTask | null> {
  return ((await local.get('task')).task as CurrentTask | null) ?? null;
}
async function setTask(t: CurrentTask | null) { await local.set({ task: t }); }
async function getVaultMeta(): Promise<VaultMeta | null> {
  return ((await local.get('vault')).vault as VaultMeta | undefined) ?? null;
}
async function getKeys(): Promise<Record<string, EncryptedBlob>> {
  return ((await local.get('keys')).keys as Record<string, EncryptedBlob>) ?? {};
}
/** 解锁后的密钥只放在 session 存储（浏览器关闭即清除） */
async function getCryptoKey(): Promise<CryptoKey | null> {
  const raw = (await session.get('vk')).vk as string | undefined;
  return raw ? importRaw(raw) : null;
}
async function getPendingKey(): Promise<{ email: string; key: string } | null> {
  return ((await session.get('pendingKey')).pendingKey as { email: string; key: string } | undefined) ?? null;
}

async function state(): Promise<AppState> {
  const [roster, settings, task, meta, keys, ck, pk] = await Promise.all([
    getRoster(), getSettings(), getTask(), getVaultMeta(), getKeys(), getCryptoKey(), getPendingKey(),
  ]);
  return { roster, settings, task, vaultReady: !!meta, unlocked: !!ck, keys: Object.keys(keys), pendingKey: !!pk };
}

async function updateColleague(email: string, patch: Partial<Colleague> & { status?: Status }) {
  const roster = await getRoster();
  const c = roster.find((x) => x.email === email);
  if (!c) throw new Error('名单中没有该邮箱');
  if (patch.status && patch.status !== c.status && !canTransition(c.status, patch.status)) {
    throw new Error(`当前状态不允许此操作（${c.status} → ${patch.status}）`);
  }
  Object.assign(c, patch, { updatedAt: new Date().toISOString() });
  await setRoster(roster);
  return c;
}

async function storeKey(email: string, key: string) {
  const ck = await getCryptoKey();
  if (!ck) {
    // 未解锁时暂存在 session，解锁后自动加密落盘
    await session.set({ pendingKey: { email, key } });
    return;
  }
  const keys = await getKeys();
  keys[email] = await encrypt(ck, key);
  await local.set({ keys });
}

async function flushPendingKey() {
  const pk = await getPendingKey();
  if (!pk) return;
  await storeKey(pk.email, pk.key);
  await session.remove('pendingKey');
}

async function readKey(email: string): Promise<string> {
  const pk = await getPendingKey();
  if (pk?.email === email) return pk.key;
  const ck = await getCryptoKey();
  if (!ck) throw new Error('请先解锁');
  const blob = (await getKeys())[email];
  if (!blob) throw new Error('本地没有该同事的 Key');
  return decrypt(ck, blob);
}

async function currentColleague(): Promise<Colleague | null> {
  const task = await getTask();
  if (!task) return null;
  return (await getRoster()).find((c) => c.email === task.email) ?? null;
}

async function beginTask(email: string, reuseTabId?: number) {
  const settings = await getSettings();
  const err = settingsReady(settings);
  if (err) throw new Error(err);
  if (await getTask()) throw new Error('已有进行中的任务，一次只处理一个人');
  const roster = await getRoster();
  const c = roster.find((x) => x.email === email);
  if (!c) throw new Error('名单中没有该邮箱');
  if (!isAllowed(c.email, settings.allowedDomains)) throw new Error('非公司域名');
  if (c.status !== 'pending') throw new Error('只有「待开始」的同事可以开始');
  await updateColleague(c.email, { status: 'filling', keyName: renderKeyName(settings.keyNameTemplate, c), note: '' });
  let tabId = reuseTabId;
  if (tabId !== undefined) {
    await setTask({ email: c.email, tabId, startedAt: new Date().toISOString() });
    await browser.tabs.update(tabId, { url: LOGIN_URL, active: true });
  } else {
    const tab = await browser.tabs.create({ url: LOGIN_URL, active: true });
    tabId = tab.id;
    await setTask({ email: c.email, tabId, startedAt: new Date().toISOString() });
  }
}

const PANEL_URL = () => browser.runtime.getURL('/sidepanel.html');

/** 打开助手面板。必须在用户手势的同步调用栈里执行（不能先 await）。 */
function openPanel(tabId?: number, windowId?: number) {
  const c = (globalThis as any).chrome;
  if (c?.sidePanel?.open) {
    const p = tabId !== undefined ? c.sidePanel.open({ tabId }) : c.sidePanel.open({ windowId });
    return Promise.resolve(p).catch(() => browser.tabs.create({ url: PANEL_URL() }));
  }
  const sb = (browser as any).sidebarAction;
  if (sb?.open) return Promise.resolve(sb.open()).catch(() => browser.tabs.create({ url: PANEL_URL() }));
  return browser.tabs.create({ url: PANEL_URL() });
}

async function handle(msg: Msg, sender: { tab?: { id?: number; url?: string } }): Promise<unknown> {
  switch (msg.type) {
    case 'getState':
      return state();

    case 'saveSettings': {
      const s: Settings = {
        allowedDomains: normalizeDomains(msg.settings.allowedDomains),
        keyNameTemplate: msg.settings.keyNameTemplate.trim() || DEFAULT_SETTINGS.keyNameTemplate,
        mode: msg.settings.mode === 'admin' ? 'admin' : 'self',
      };
      await local.set({ settings: s });
      return state();
    }

    case 'importRoster': {
      const settings = await getSettings();
      const err = settingsReady(settings);
      if (err) throw new Error(err);
      const roster = await getRoster();
      const { added, rejected } = parseRoster(msg.csv, settings.allowedDomains, roster);
      await setRoster([...roster, ...added]);
      return { added: added.length, rejected };
    }

    case 'removeColleague': {
      const roster = await getRoster();
      const c = roster.find((x) => x.email === msg.email);
      if (c && ACTIVE.includes(c.status)) throw new Error('进行中的任务请先停止');
      await setRoster(roster.filter((x) => x.email !== msg.email));
      return state();
    }

    case 'createVault': {
      if (await getVaultMeta()) throw new Error('已设置过口令');
      const { meta, key } = await createVault(msg.passphrase);
      await local.set({ vault: meta });
      await session.set({ vk: await exportRaw(key) });
      await flushPendingKey();
      return state();
    }

    case 'unlock': {
      const meta = await getVaultMeta();
      if (!meta) throw new Error('尚未设置口令');
      const key = await unlockVault(msg.passphrase, meta);
      await session.set({ vk: await exportRaw(key) });
      await flushPendingKey();
      return state();
    }

    case 'lock':
      await session.remove('vk');
      return state();

    case 'startTask':
      await beginTask(msg.email);
      return state();

    case 'cs:selfStart': {
      const settings = await getSettings();
      const err = settingsReady(settings);
      if (err) throw new Error(`${err}（请先在助手面板「设置」里填写）`);
      if (await getTask()) throw new Error('已有进行中的任务，一次只处理一个人');
      const email = msg.email.trim().toLowerCase();
      const name = msg.name.trim();
      if (!name) throw new Error('请填写姓名');
      if (!isAllowed(email, settings.allowedDomains)) throw new Error(`只能使用公司邮箱（${settings.allowedDomains.join('、')}）`);
      const roster = await getRoster();
      const existing = roster.find((c) => c.email === email);
      if (existing && existing.status !== 'pending') {
        throw new Error('该邮箱已经处理过（一人一号），如需重来请在面板里重置');
      }
      if (!existing) {
        const { added, rejected } = parseRoster(`${name},${email}`, settings.allowedDomains, roster);
        if (!added.length) throw new Error(rejected[0]?.reason ?? '无法添加');
        await setRoster([...roster, ...added]);
      }
      await beginTask(email, sender.tab?.id);
      return { ok: true };
    }

    case 'cs:status': {
      const [settings, task] = await Promise.all([getSettings(), getTask()]);
      return { busy: !!task, domains: settings.allowedDomains, ready: !settingsReady(settings) };
    }

    case 'stopTask': {
      const c = await currentColleague();
      if (c && ACTIVE.includes(c.status)) await updateColleague(c.email, { status: 'pending', note: '已手动停止' });
      await setTask(null);
      return state();
    }

    case 'markSent':
    case 'cs:linkSent': {
      const task = await getTask();
      const c = await currentColleague();
      if (!task || !c) throw new Error('没有进行中的任务');
      if (c.status === 'filling') await updateColleague(c.email, { status: 'awaiting_link' });
      await setTask({ ...task, linkSentAt: new Date().toISOString() });
      return state();
    }

    case 'cs:rejected': {
      const c = await currentColleague();
      if (c && ACTIVE.includes(c.status)) await updateColleague(c.email, { status: 'failed', note: msg.reason });
      await setTask(null);
      return state();
    }

    case 'openLink': {
      const task = await getTask();
      if (!task) throw new Error('没有进行中的任务');
      if (!isApmixUrl(msg.url)) throw new Error('只接受 apmix.ai 的链接');
      const tab = task.tabId != null
        ? await browser.tabs.update(task.tabId, { url: msg.url, active: true }).catch(() => null)
        : null;
      if (!tab) {
        const t = await browser.tabs.create({ url: msg.url, active: true });
        await setTask({ ...task, tabId: t.id });
      }
      return state();
    }

    case 'cs:getTask': {
      const task = await getTask();
      const c = await currentColleague();
      if (!task || !c) return null;
      const settings = await getSettings();
      const info: CsTaskInfo = {
        name: c.name, email: c.email, status: c.status,
        keyName: c.keyName ?? renderKeyName(settings.keyNameTemplate, c),
        hint: hintFor(c.status, settings.mode),
      };
      // 登录完成：进入 dashboard 时推进到 signed_in
      if (c.status === 'awaiting_link' && isDashboardUrl(sender.tab?.url)) {
        await updateColleague(c.email, { status: 'signed_in' });
        info.status = 'signed_in';
        info.hint = hintFor('signed_in', settings.mode);
        if (sender.tab?.id != null && !sender.tab.url?.includes('/dashboard/keys')) {
          await browser.tabs.update(sender.tab.id, { url: KEYS_URL });
        }
      }
      return info;
    }

    case 'cs:keyCaptured': {
      const c = await currentColleague();
      if (!c || c.status !== 'signed_in') return null;
      await storeKey(c.email, msg.key);
      await updateColleague(c.email, {
        status: 'key_captured',
        emailUnverified: !msg.emailSeen,
        note: msg.emailSeen ? '' : '页面上未看到该邮箱，请确认登录的是本人账号',
      });
      await setTask(null);
      return state();
    }

    case 'resetColleague': {
      const roster = await getRoster();
      const c = roster.find((x) => x.email === msg.email);
      if (!c) throw new Error('名单中没有该邮箱');
      if (c.status !== 'failed') throw new Error('只有失败的记录可以重置');
      await updateColleague(c.email, { status: 'pending', note: '' });
      return state();
    }

    case 'getKey':
      return readKey(msg.email);

    case 'testKey':
      return testKey(await readKey(msg.email));

    case 'deleteKey': {
      const keys = await getKeys();
      delete keys[msg.email];
      await local.set({ keys });
      const pk = await getPendingKey();
      if (pk?.email === msg.email) await session.remove('pendingKey');
      return state();
    }

    case 'markDelivered': {
      await updateColleague(msg.email, { status: 'delivered' });
      if (msg.deleteKey) await handle({ type: 'deleteKey', email: msg.email }, sender);
      return state();
    }

    case 'clearApmixSession': {
      const settings = await getSettings();
      if (settings.mode !== 'admin') throw new Error('仅管理员代办模式可用');
      if (await getTask()) throw new Error('请先结束当前任务');
      const granted = await browser.permissions.request({ permissions: ['cookies'] });
      if (!granted) throw new Error('未授予 Cookie 权限');
      let n = 0;
      for (const domain of ['apmix.ai', '.apmix.ai']) {
        const cookies = await browser.cookies.getAll({ domain });
        for (const ck of cookies) {
          const url = `https://${ck.domain.replace(/^\./, '')}${ck.path}`;
          await browser.cookies.remove({ url, name: ck.name });
          n++;
        }
      }
      return { removed: n };
    }
  }
}

export default defineBackground(() => {
  // Chrome / Edge：点工具栏图标直接打开侧栏
  (globalThis as any).chrome?.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true })?.catch?.(() => {});
  // Firefox：点图标切换侧栏（Chrome 设置了上面的行为后不会触发 onClicked）
  browser.action?.onClicked?.addListener((tab) => {
    const sb = (browser as any).sidebarAction;
    if (sb?.toggle) void sb.toggle();
    else void openPanel(tab.id, tab.windowId);
  });

  // 右键菜单：工具栏图标 / apmix.ai 页面
  const menus = (browser as any).contextMenus ?? (browser as any).menus;
  browser.runtime.onInstalled.addListener(() => {
    menus?.removeAll?.(() => {
      menus.create({ id: 'apmix-open', title: '打开 APMIX 协助注册', contexts: ['action'] });
      menus.create({
        id: 'apmix-open-page', title: '打开 APMIX 协助注册', contexts: ['page'],
        documentUrlPatterns: ['https://apmix.ai/*', 'https://www.apmix.ai/*'],
      });
    });
  });
  menus?.onClicked?.addListener((_info: unknown, tab?: { id?: number; windowId?: number }) => {
    void openPanel(tab?.id, tab?.windowId);
  });

  browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
    const msg = raw as Msg;
    if (!msg || typeof msg.type !== 'string') { sendResponse({ ok: false, error: '拒绝' }); return true; }
    // 只接受本扩展页面与 apmix.ai 内容脚本的消息
    if (sender.id !== browser.runtime.id) { sendResponse({ ok: false, error: '拒绝' }); return true; }
    if (msg.type.startsWith('cs:') && !(sender.tab?.url && isApmixUrl(sender.tab.url))) { sendResponse({ ok: false, error: '拒绝' }); return true; }
    if (msg.type === 'cs:openPanel') {
      // 同步调用，保留页面点击的用户手势
      openPanel(sender.tab?.id, sender.tab?.windowId).then(
        () => sendResponse({ ok: true, data: null }),
        (e: Error) => sendResponse({ ok: false, error: e.message }),
      );
      return true;
    }
    handle(msg, sender)
      .then((data) => sendResponse({ ok: true, data } satisfies Reply))
      .catch((e: Error) => sendResponse({ ok: false, error: e.message } satisfies Reply));
    return true;
  });

  // 任务标签页被关闭：保留状态，仅解除绑定
  browser.tabs.onRemoved.addListener(async (tabId) => {
    const task = await getTask();
    if (task?.tabId === tabId) await setTask({ ...task, tabId: undefined });
  });
});
