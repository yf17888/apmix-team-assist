import { LOGIN } from '@/utils/selectors';
import { first, setInputValue, ensureChecked, findButtonByText, pageText, highlight } from '@/utils/dom';
import { showOverlay, hideOverlay } from '@/utils/overlay';
import type { CsTaskInfo } from '@/utils/messages';

async function ask<T>(msg: object): Promise<T | null> {
  const r = (await browser.runtime.sendMessage(msg)) as { ok: boolean; data: T } | undefined;
  return r?.ok ? r.data : null;
}

export default defineContentScript({
  matches: ['https://apmix.ai/login*', 'https://www.apmix.ai/login*'],
  runAt: 'document_idle',
  async main(ctx) {
    const task = await ask<CsTaskInfo>({ type: 'cs:getTask' });
    if (!task || task.status !== 'filling') return;

    const stop = () => { void ask({ type: 'stopTask' }); hideOverlay(); };
    showOverlay(`正在为 ${task.name} 注册`, '正在填写邮箱…', stop);

    // 等表单渲染出来（SPA）
    let email: HTMLInputElement | null = null;
    for (let i = 0; i < 40 && !email; i++) {
      email = first<HTMLInputElement>(LOGIN.email);
      if (!email) await new Promise<void>((r) => ctx.setTimeout(() => r(), 250));
    }
    if (!email) {
      showOverlay(`正在为 ${task.name} 注册`, '没找到邮箱输入框，页面可能已改版，请手动填写。', stop);
      return;
    }

    setInputValue(email, task.email);
    const terms = first(LOGIN.terms);
    if (terms) ensureChecked(terms);
    // 只高亮，不点击：人机验证与提交由人完成
    highlight(findButtonByText(LOGIN.submitText));
    showOverlay(`正在为 ${task.name} 注册`, task.hint, stop);

    let done = false;
    const check = () => {
      if (done) return;
      const text = pageText();
      if (LOGIN.rejectedText.test(text)) {
        done = true;
        void ask({ type: 'cs:rejected', reason: '邮箱被 apmix 拒绝' });
        showOverlay('注册未通过', 'apmix 拒绝了该邮箱，已标记为失败。', hideOverlay);
      } else if (LOGIN.sentText.test(text)) {
        done = true;
        void ask({ type: 'cs:linkSent' });
        showOverlay(`已发送登录链接`, '请到公司邮箱打开 apmix 发来的链接。', stop);
      }
    };
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    ctx.onInvalidated(() => mo.disconnect());
  },
});
