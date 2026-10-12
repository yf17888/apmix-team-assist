/**
 * apmix.ai 页面左下角的「协助注册」入口（Shadow DOM，不影响页面样式）。
 * 没有进行中的任务时显示；点开后可以：
 *  - 用公司邮箱自助注册（填写姓名 + 公司邮箱，插件接管后续填表）
 *  - 打开助手面板（名单、设置、Key 管理）
 */
interface Status { busy: boolean; domains: string[]; ready: boolean }

async function ask<T>(msg: object): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    return ((await browser.runtime.sendMessage(msg)) as { ok: boolean; data?: T; error?: string }) ?? { ok: false, error: '无响应' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

const HOST_ID = 'apmix-team-assist-menu';

export default defineContentScript({
  matches: ['https://apmix.ai/*', 'https://www.apmix.ai/*'],
  runAt: 'document_idle',
  async main(ctx) {
    const status = await ask<Status>({ type: 'cs:status' });
    if (!status.ok || !status.data || status.data.busy) return; // 有任务时由进度浮层接管
    if (document.getElementById(HOST_ID)) return;

    const host = document.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'open' });
    const domains = status.data.domains;
    root.innerHTML = `
      <style>
        :host{all:initial}
        .fab{position:fixed;left:16px;bottom:16px;z-index:2147483646;background:#7c5cff;color:#fff;
          border:0;border-radius:999px;padding:9px 16px;font:600 13px system-ui,sans-serif;cursor:pointer;
          box-shadow:0 6px 20px rgba(124,92,255,.4)}
        .menu{position:fixed;left:16px;bottom:62px;z-index:2147483646;width:280px;background:#14121f;color:#fff;
          font:13px/1.5 system-ui,sans-serif;border:1px solid #7c5cff;border-radius:10px;padding:12px;
          box-shadow:0 8px 28px rgba(0,0,0,.35)}
        .menu[hidden]{display:none}
        .t{font-weight:600;margin-bottom:6px}
        input{box-sizing:border-box;width:100%;margin:4px 0;padding:6px 8px;border-radius:6px;border:1px solid #3a3550;
          background:#1f1c2e;color:#fff;font:13px system-ui,sans-serif}
        button.p{width:100%;margin-top:6px;background:#7c5cff;color:#fff;border:0;border-radius:6px;padding:7px;cursor:pointer;font:600 13px system-ui,sans-serif}
        button.s{width:100%;margin-top:6px;background:transparent;color:#cfc6ff;border:1px solid #3a3550;border-radius:6px;padding:6px;cursor:pointer;font:13px system-ui,sans-serif}
        .err{color:#ff8a8a;min-height:18px;margin-top:4px}
        .muted{color:#a9a3c4;font-size:12px}
        hr{border:0;border-top:1px solid #2c2840;margin:10px 0}
      </style>
      <button class="fab" type="button">协助注册</button>
      <div class="menu" hidden>
        <div class="t">用公司邮箱注册 apmix</div>
        <div class="muted"></div>
        <input class="name" placeholder="姓名" autocomplete="name" />
        <input class="email" placeholder="公司邮箱" type="email" autocomplete="email" />
        <button class="p go" type="button">开始注册</button>
        <div class="err"></div>
        <hr />
        <button class="s panel" type="button">打开助手面板（名单 / 设置 / Key）</button>
      </div>`;
    const $ = <T extends Element>(s: string) => root.querySelector(s) as T;
    const menu = $<HTMLDivElement>('.menu');
    const err = $<HTMLDivElement>('.err');
    $<HTMLDivElement>('.muted').textContent = status.data.ready
      ? `仅限 ${domains.join('、')}。人机验证和发送按钮需要你本人完成。`
      : '还没有设置公司域名，请先打开助手面板，在「设置」里填写。';
    if (!status.data.ready) {
      ($<HTMLButtonElement>('.go')).disabled = true;
    }

    $<HTMLButtonElement>('.fab').addEventListener('click', () => { menu.hidden = !menu.hidden; });
    $<HTMLButtonElement>('.panel').addEventListener('click', () => {
      // 不要在这之前 await：后台需要页面点击的用户手势来打开侧栏
      void ask({ type: 'cs:openPanel' });
      menu.hidden = true;
    });
    $<HTMLButtonElement>('.go').addEventListener('click', async () => {
      err.textContent = '';
      const name = $<HTMLInputElement>('.name').value.trim();
      const email = $<HTMLInputElement>('.email').value.trim();
      if (!name || !email) { err.textContent = '请填写姓名和公司邮箱'; return; }
      const r = await ask({ type: 'cs:selfStart', name, email });
      if (!r.ok) { err.textContent = r.error ?? '开始失败'; return; }
      host.remove(); // 页面即将跳转到登录页，由进度浮层接管
    });

    document.documentElement.appendChild(host);
    ctx.onInvalidated(() => host.remove());
  },
});
