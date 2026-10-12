import type { AppState, Colleague, Status } from '@/utils/types';
import { STATUS_LABEL } from '@/utils/types';
import { send } from '@/utils/messages';
import { STEP_ORDER, hintFor } from '@/utils/flow';
import { buildConfigs, buildHandoff, maskKey } from '@/utils/export';
import { rosterToCsv } from '@/utils/roster';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
let st: AppState;
let openDetail: string | null = null;
const PAGE = 50;
let page = 0;

function esc(s: string | undefined): string {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function toast(text: string) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout((toast as unknown as { h?: number }).h);
  (toast as unknown as { h?: number }).h = window.setTimeout(() => (t.hidden = true), 2600);
}

async function run<T>(p: Promise<T>, ok?: string): Promise<T | undefined> {
  try {
    const r = await p;
    if (ok) toast(ok);
    return r;
  } catch (e) {
    toast((e as Error).message);
    return undefined;
  }
}

async function refresh() {
  const s = await run(send({ type: 'getState' }));
  if (s) { st = s; render(); }
}

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function renderLock() {
  const el = $('#lock');
  if (!st.vaultReady) {
    el.innerHTML = `<div class="card"><b>先设置本地加密口令</b>
      <p class="muted small">Key 用该口令加密保存在本机；口令不会保存，忘记后无法找回已存的 Key。</p>
      <div class="row"><input type="password" id="pw" placeholder="至少 8 位" /><button class="primary" id="pwSet">设置</button></div></div>`;
    $('#pwSet').onclick = async () => { const s = await run(send({ type: 'createVault', passphrase: $<HTMLInputElement>('#pw').value }), '已设置'); if (s) { st = s; render(); } };
  } else if (!st.unlocked) {
    el.innerHTML = `<div class="card"><b>已锁定</b>${st.pendingKey ? '<p class="warn small">有一个刚捕获的 Key 等待加密保存，请解锁。</p>' : ''}
      <div class="row"><input type="password" id="pw" placeholder="口令" /><button class="primary" id="pwUnlock">解锁</button></div></div>`;
    $('#pwUnlock').onclick = async () => { const s = await run(send({ type: 'unlock', passphrase: $<HTMLInputElement>('#pw').value }), '已解锁'); if (s) { st = s; render(); } };
  } else {
    el.innerHTML = `<div class="row muted small">已解锁 · <button id="lockBtn">锁定</button></div>`;
    $('#lockBtn').onclick = async () => { const s = await run(send({ type: 'lock' })); if (s) { st = s; render(); } };
  }
}

function steps(status: Status): string {
  const idx = STEP_ORDER.indexOf(status);
  return `<div class="steps">${STEP_ORDER.slice(1).map((_, i) => `<span class="${i < idx ? 'done' : ''}"></span>`).join('')}</div>`;
}

function renderTask() {
  const el = $('#task');
  const c = st.task && st.roster.find((x) => x.email === st.task!.email);
  if (!c) { el.innerHTML = ''; return; }
  const admin = st.settings.mode === 'admin';
  el.innerHTML = `<div class="card task">
    <div><b>当前：${esc(c.name)}</b> <span class="muted">${esc(c.email)}</span></div>
    ${steps(c.status)}
    <div>${esc(hintFor(c.status, st.settings.mode))}</div>
    ${c.status === 'filling' ? '<div class="row"><button id="sent">我已点击发送</button></div>' : ''}
    ${c.status === 'awaiting_link' && admin ? `<div class="row"><input id="link" placeholder="粘贴 apmix 登录链接（需同事同意）" /><button class="primary" id="openLink">打开</button></div>` : ''}
    <div class="row"><button class="danger" id="stopTask">停止本次任务</button></div>
  </div>`;
  $('#stopTask').onclick = async () => { const s = await run(send({ type: 'stopTask' }), '已停止'); if (s) { st = s; render(); } };
  document.querySelector<HTMLButtonElement>('#sent')?.addEventListener('click', async () => { const s = await run(send({ type: 'markSent' })); if (s) { st = s; render(); } });
  document.querySelector<HTMLButtonElement>('#openLink')?.addEventListener('click', async () => {
    const url = $<HTMLInputElement>('#link').value.trim();
    const s = await run(send({ type: 'openLink', url }), '已打开链接');
    if (s) { st = s; render(); }
  });
}

function itemActions(c: Colleague): string {
  const busy = !!st.task;
  const hasKey = st.keys.includes(c.email) || (st.pendingKey && c.status === 'key_captured');
  const a: string[] = [];
  if (c.status === 'pending') a.push(`<button class="primary" data-act="start" ${busy ? 'disabled' : ''}>开始</button>`);
  if (c.status === 'failed') a.push(`<button data-act="reset">重置</button>`);
  if (hasKey) a.push(`<button data-act="detail">${openDetail === c.email ? '收起' : '查看 Key'}</button>`);
  if (!['filling', 'awaiting_link', 'signed_in'].includes(c.status)) a.push(`<button data-act="remove" title="从名单移除">✕</button>`);
  return a.join('');
}

async function renderDetail(c: Colleague, host: HTMLElement) {
  const key = await run(send<string>({ type: 'getKey', email: c.email }));
  if (!key) return;
  const cfg = buildConfigs(key);
  host.innerHTML = `<div class="card">
    <div>Key：<code>${esc(maskKey(key))}</code></div>
    ${c.emailUnverified ? '<p class="warn small">页面上未核对到该邮箱，请确认登录的是本人账号。</p>' : ''}
    <div class="row">
      <button data-copy="key">复制 Key</button>
      <button data-copy="claudeCode">Claude Code</button>
      <button data-copy="codex">Codex</button>
      <button data-copy="all">复制全部配置</button>
    </div>
    <div class="row">
      <button data-x="test">连通性检测</button>
      <button data-x="file">导出交付文件</button>
    </div>
    <pre>${esc(cfg.claudeCode.replace(key, maskKey(key)))}</pre>
    <div class="row">
      ${c.status === 'key_captured' ? '<button class="primary" data-x="deliver">标记已交付并删除本地 Key</button>' : ''}
      <button class="danger" data-x="del">删除本地 Key</button>
    </div>
  </div>`;
  const handoff = buildHandoff(c.name, c.email, key);
  host.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) => (b.onclick = async () => {
    const k = b.dataset.copy!;
    const text = k === 'key' ? key : k === 'all' ? handoff : cfg[k as keyof typeof cfg];
    await navigator.clipboard.writeText(text);
    toast('已复制');
  }));
  host.querySelector<HTMLButtonElement>('[data-x="test"]')!.onclick = async () => {
    const r = await run(send<{ ok: boolean; detail: string }>({ type: 'testKey', email: c.email }));
    if (r) toast(r.ok ? `可用：${r.detail}` : `不可用：${r.detail}`);
  };
  host.querySelector<HTMLButtonElement>('[data-x="file"]')!.onclick = () => download(`apmix-${c.email.split('@')[0]}.txt`, handoff);
  host.querySelector<HTMLButtonElement>('[data-x="deliver"]')?.addEventListener('click', async () => {
    if (!confirm('确认已交付给同事？本地 Key 将被删除。')) return;
    const s = await run(send({ type: 'markDelivered', email: c.email, deleteKey: true }), '已交付');
    if (s) { st = s; openDetail = null; render(); }
  });
  host.querySelector<HTMLButtonElement>('[data-x="del"]')!.onclick = async () => {
    if (!confirm('删除后无法恢复，确定？')) return;
    const s = await run(send({ type: 'deleteKey', email: c.email }), '已删除');
    if (s) { st = s; openDetail = null; render(); }
  };
}

function renderList() {
  const q = $<HTMLInputElement>('#search').value.trim().toLowerCase();
  const f = $<HTMLSelectElement>('#filter').value;
  const list = st.roster.filter((c) =>
    (!f || c.status === f) && (!q || `${c.name} ${c.email} ${c.dept ?? ''}`.toLowerCase().includes(q)));
  const el = $('#list');
  if (!st.roster.length) { el.innerHTML = '<p class="muted">还没有名单，先在设置里填公司域名，再导入。</p>'; return; }
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  if (page >= pages) page = pages - 1;
  const shown = list.slice(page * PAGE, page * PAGE + PAGE);
  const counts = st.roster.reduce<Record<string, number>>((m, c) => ((m[c.status] = (m[c.status] ?? 0) + 1), m), {});
  const summary = `<p class="muted small">共 ${st.roster.length} 人 · 已交付 ${counts.delivered ?? 0} · 待交付 ${counts.key_captured ?? 0} · 失败 ${counts.failed ?? 0} · 待开始 ${counts.pending ?? 0}</p>`;
  const pager = pages > 1 ? `<div class="row"><button id="prev" ${page === 0 ? 'disabled' : ''}>上一页</button><span class="muted">${page + 1} / ${pages}（${list.length} 条）</span><button id="next" ${page >= pages - 1 ? 'disabled' : ''}>下一页</button></div>` : '';
  el.innerHTML = summary + shown.map((c) => `
    <div class="item" data-email="${esc(c.email)}">
      <div>
        <div class="name">${esc(c.name)} <span class="badge ${c.status}">${STATUS_LABEL[c.status]}</span></div>
        <div class="muted small">${esc(c.email)}${c.dept ? ' · ' + esc(c.dept) : ''}</div>
        ${c.note ? `<div class="small warn">${esc(c.note)}</div>` : ''}
      </div>
      <div class="actions">${itemActions(c)}</div>
      <div class="detail" style="grid-column:1/-1"></div>
    </div>`).join('') + pager || '<p class="muted">没有匹配的记录</p>';
  document.querySelector<HTMLButtonElement>('#prev')?.addEventListener('click', () => { page--; renderList(); });
  document.querySelector<HTMLButtonElement>('#next')?.addEventListener('click', () => { page++; renderList(); });

  el.querySelectorAll<HTMLElement>('.item').forEach((row) => {
    const email = row.dataset.email!;
    const c = st.roster.find((x) => x.email === email)!;
    row.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => (b.onclick = async () => {
      const act = b.dataset.act;
      if (act === 'start') {
        if (!st.vaultReady) return toast('请先设置加密口令');
        const s = await run(send({ type: 'startTask', email }));
        if (s) { st = s; render(); }
      } else if (act === 'reset') {
        const s = await run(send({ type: 'resetColleague', email }));
        if (s) { st = s; render(); }
      } else if (act === 'remove') {
        if (st.keys.includes(email) && !confirm('该同事还有本地 Key，确定移除？')) return;
        const s = await run(send({ type: 'removeColleague', email }));
        if (s) { st = s; render(); }
      } else if (act === 'detail') {
        openDetail = openDetail === email ? null : email;
        renderList();
      }
    }));
    if (openDetail === email) void renderDetail(c, row.querySelector('.detail')!);
  });
}

function renderSettings() {
  $<HTMLInputElement>('#domains').value = st.settings.allowedDomains.join(', ');
  $<HTMLInputElement>('#keyTpl').value = st.settings.keyNameTemplate;
  $<HTMLSelectElement>('#mode').value = st.settings.mode;
  const tools = $('#adminTools');
  if (st.settings.mode === 'admin') {
    tools.innerHTML = `<p><b>管理员工具</b></p>
      <p class="muted small">处理下一位同事前，清除本浏览器中 apmix.ai 的登录状态（需授予 Cookie 权限）。</p>
      <button id="clearSession">清除 apmix 登录状态</button>`;
    $('#clearSession').onclick = async () => {
      if (!confirm('将退出本浏览器中的 apmix 登录，继续？')) return;
      const r = await run(send<{ removed: number }>({ type: 'clearApmixSession' }));
      if (r) toast(`已清除 ${r.removed} 个 Cookie`);
    };
  } else tools.innerHTML = '';
}

function render() {
  renderLock();
  renderTask();
  renderList();
  renderSettings();
}

function bind() {
  document.querySelectorAll<HTMLButtonElement>('nav button').forEach((b) => (b.onclick = () => {
    document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('on', x === b));
    $('#tab-roster').hidden = b.dataset.tab !== 'roster';
    $('#tab-settings').hidden = b.dataset.tab !== 'settings';
  }));
  const filter = $<HTMLSelectElement>('#filter');
  for (const [k, v] of Object.entries(STATUS_LABEL)) filter.add(new Option(v, k));
  filter.onchange = () => { page = 0; renderList(); };
  $<HTMLInputElement>('#search').oninput = () => { page = 0; renderList(); };

  $<HTMLInputElement>('#csvFile').onchange = async (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) $<HTMLTextAreaElement>('#csv').value = await f.text();
  };
  $('#doImport').onclick = async () => {
    const r = await run(send<{ added: number; rejected: { line: string; reason: string }[] }>({ type: 'importRoster', csv: $<HTMLTextAreaElement>('#csv').value }));
    if (!r) return;
    $('#importResult').innerHTML = `新增 ${r.added} 人` + (r.rejected.length
      ? `，跳过 ${r.rejected.length} 行：<br>${r.rejected.map((x) => `${esc(x.line)}（${x.reason}）`).join('<br>')}` : '');
    $<HTMLTextAreaElement>('#csv').value = '';
    await refresh();
  };
  $('#exportCsv').onclick = () => download('apmix-roster.csv', rosterToCsv(st.roster));
  $('#saveSettings').onclick = async () => {
    const s = await run(send({
      type: 'saveSettings',
      settings: {
        allowedDomains: $<HTMLInputElement>('#domains').value.split(/[\s,;，；]+/),
        keyNameTemplate: $<HTMLInputElement>('#keyTpl').value,
        mode: $<HTMLSelectElement>('#mode').value as 'self' | 'admin',
      },
    }), '已保存');
    if (s) { st = s; render(); }
  };

  browser.storage.onChanged.addListener(() => void refresh());
}

bind();
void refresh();
