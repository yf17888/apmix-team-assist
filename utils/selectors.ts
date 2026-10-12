/** apmix 页面选择器集中管理；页面改版时只改这里（需在真实页面上核对） */
export const LOGIN = {
  email: 'input[type="email"]',
  terms: 'input[type="checkbox"]',
  submitText: /send magic link/i,
  rejectedText: /temporary inboxes are not accepted/i,
};

export const KEYS = {
  createText: /create key/i,
  nameInput: 'input[type="text"]',
  keyPattern: /apx_live_[A-Za-z0-9_-]+/,
};
