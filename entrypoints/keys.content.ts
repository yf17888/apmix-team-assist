import { KEYS, findKey } from '@/utils/selectors';
import { first, setInputValue, findButtonByText, highlight, pageText } from '@/utils/dom';
import { showOverlay, hideOverlay } from '@/utils/overlay';
import type { CsTaskInfo } from '@/utils/messages';

async function ask<T>(msg: object): Promise<T | null> {
  const r = (await browser.runtime.sendMessage(msg)) as { ok: boolean; data: T } | undefined;
  return r?.ok ? r.data : null;
}

export default defineContentScript({
  matches: ['https://apmix.ai/dashboard*', 'https://www.apmix.ai/dashboard*'],
  runAt: 'document_idle',
  async main(ctx) {
    const task = await ask<CsTaskInfo>({ type: 'cs:getTask' });
    if (!task || task.status !== 'signed_in') return;
    if (!location.pathname.startsWith('/dashboard/keys')) return; // 后台会跳转到 Keys 页

    const stop = () => { void ask({ type: 'stopTask' }); hideOverlay(); };
    showOverlay(`为 ${task.name} 创建 Key`, task.hint, stop);
    highlight(findButtonByText(KEYS.createText));

    // 页面上已有的 Key（打码的不算）作为基线，只捕获新出现的
    const baseline = findKey(document);
    let filledName = false;
    let captured = false;

    const tick = () => {
      if (captured) return;
      if (!filledName) {
        const input = first<HTMLInputElement>(KEYS.nameInput);
        if (input && !input.value) { setInputValue(input, task.keyName); filledName = true; }
      }
      const key = findKey(document);
      if (key && key !== baseline) {
        captured = true;
        const emailSeen = pageText().toLowerCase().includes(task.email.toLowerCase());
        void ask({ type: 'cs:keyCaptured', key, emailSeen });
        showOverlay('Key 已保存', '已加密保存在插件里，回到侧栏复制配置交付给同事。', hideOverlay);
        mo.disconnect();
      }
    };
    const mo = new MutationObserver(tick);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value'] });
    document.addEventListener('input', tick, true);
    ctx.onInvalidated(() => mo.disconnect());
  },
});
