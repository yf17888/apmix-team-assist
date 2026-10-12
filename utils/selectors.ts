/** apmix 页面选择器集中管理；页面改版时只改这里（需在真实页面上核对） */
export const APMIX_ORIGIN = 'https://apmix.ai';
export const LOGIN_URL = `${APMIX_ORIGIN}/login`;
export const KEYS_URL = `${APMIX_ORIGIN}/dashboard/keys`;

export const LOGIN = {
  email: ['input[type="email"]', 'input[name="email"]', 'input[autocomplete="email"]'],
  terms: ['input[type="checkbox"]', '[role="checkbox"]'],
  submitText: /send magic link|发送.*链接/i,
  sentText: /check your (e-?mail|inbox)|link (has been )?sent|we sent|已发送|查收/i,
  rejectedText: /temporary inboxes are not accepted|not accepted|invalid email/i,
};

export const KEYS = {
  createText: /create (a )?(new )?key|创建/i,
  nameInput: [
    '[role="dialog"] input[type="text"]',
    '[role="dialog"] input:not([type])',
    'input[name*="name" i]',
    'input[placeholder*="name" i]',
  ],
  keyPattern: /apx_live_[A-Za-z0-9_-]{8,}/,
};

export function isApmixUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && (u.hostname === 'apmix.ai' || u.hostname === 'www.apmix.ai');
  } catch {
    return false;
  }
}

export function isDashboardUrl(raw: string | undefined): boolean {
  if (!raw || !isApmixUrl(raw)) return false;
  return new URL(raw).pathname.startsWith('/dashboard');
}

/** 从页面文本与输入框中找出完整（未打码）的 Key */
export function findKey(root: ParentNode): string | null {
  const texts: string[] = [];
  root.querySelectorAll('input, textarea').forEach((el) => {
    texts.push((el as HTMLInputElement).value ?? '');
  });
  root.querySelectorAll('code, pre, [data-key], span, div, p').forEach((el) => {
    if (el.childElementCount === 0) texts.push(el.textContent ?? '');
  });
  for (const t of texts) {
    if (t.includes('•') || t.includes('*')) continue;
    const m = KEYS.keyPattern.exec(t);
    if (m) return m[0];
  }
  return null;
}
