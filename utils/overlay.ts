/** 页面右下角进度浮层（Shadow DOM，避免与页面样式冲突） */
export function showOverlay(title: string, hint: string, onStop: () => void): void {
  let host = document.getElementById('apmix-team-assist-overlay');
  if (!host) {
    host = document.createElement('div');
    host.id = 'apmix-team-assist-overlay';
    host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(host);
  }
  const root = host.shadowRoot!;
  root.innerHTML = `
    <style>
      .box{position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:320px;
        background:#14121f;color:#fff;font:13px/1.5 system-ui,sans-serif;border-radius:10px;
        padding:12px 14px;box-shadow:0 6px 24px rgba(0,0,0,.3);border:1px solid #7c5cff}
      .t{font-weight:600;margin-bottom:4px}
      button{margin-top:8px;background:#7c5cff;color:#fff;border:0;border-radius:6px;padding:4px 10px;cursor:pointer}
    </style>
    <div class="box"><div class="t"></div><div class="h"></div><button>停止本次任务</button></div>`;
  root.querySelector('.t')!.textContent = title;
  root.querySelector('.h')!.textContent = hint;
  root.querySelector('button')!.addEventListener('click', onStop);
}

export function hideOverlay(): void {
  document.getElementById('apmix-team-assist-overlay')?.remove();
}
