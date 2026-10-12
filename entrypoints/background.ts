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

    case 'startTask': {
      const settings = await getSettings();
      const err = settingsReady(settings);
      if (err) throw new Error(err);
      if (await getTask()) throw new Error('已有进行中的任务，一次只处理一个人');
      const roster = await getRoster();
      const c = roster.find((x) => x.email === msg.email);
      if (!c) throw new Error('名单中没有该邮箱');
      if (!isAllowed(c.email, settings.allowedDomains)) throw new Error('非公司域名');
      if (c.status !== 'pending') throw new Error('只有「待开始」的同事可以开始');
      await updateColleague(c.email, { status: 'filling', keyName: renderKeyName(settings.keyNameTemplate, c), note: '' });
      const tab = await browser.tabs.create({ url: LOGIN_URL, active: true });
      await setTask({ email: c.email, tabId: tab.id, startedAt: new Date().toISOString() });
      return state();
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
  (globalThis as any).chrome?.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true })?.catch?.(() => {});

  browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
    const msg = raw as Msg;
    if (!msg || typeof msg.type !== 'string') { sendResponse({ ok: false, error: '拒绝' }); return true; }
    // 只接受本扩展页面与 apmix.ai 内容脚本的消息
    if (sender.id !== browser.runtime.id) { sendResponse({ ok: false, error: '拒绝' }); return true; }
    if (msg.type.startsWith('cs:') && !(sender.tab?.url && isApmixUrl(sender.tab.url))) { sendResponse({ ok: false, error: '拒绝' }); return true; }
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
