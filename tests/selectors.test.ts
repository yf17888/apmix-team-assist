import { describe, it, expect } from 'vitest';
import { findKey, isApmixUrl, isDashboardUrl } from '../utils/selectors';
import { setInputValue, first } from '../utils/dom';

describe('findKey', () => {
  it('识别完整 Key，忽略打码的', () => {
    document.body.innerHTML = `<div><span>apx_live_9f3c••••d41e</span></div>`;
    expect(findKey(document)).toBeNull();
    document.body.innerHTML += `<div role="dialog"><code>apx_live_AbCdEf123456789</code></div>`;
    expect(findKey(document)).toBe('apx_live_AbCdEf123456789');
  });
  it('从只读输入框中识别', () => {
    document.body.innerHTML = `<input readonly value="apx_live_ZZZZZZZZZZ11" />`;
    expect(findKey(document)).toBe('apx_live_ZZZZZZZZZZ11');
  });
});

describe('url', () => {
  it('只接受 apmix.ai https 链接', () => {
    expect(isApmixUrl('https://apmix.ai/api/auth/callback?token=x')).toBe(true);
    expect(isApmixUrl('https://apmix.ai.evil.com/x')).toBe(false);
    expect(isApmixUrl('http://apmix.ai/x')).toBe(false);
    expect(isDashboardUrl('https://apmix.ai/dashboard/keys')).toBe(true);
    expect(isDashboardUrl('https://apmix.ai/login')).toBe(false);
  });
});

describe('dom', () => {
  it('写入输入框并触发 input 事件', () => {
    document.body.innerHTML = `<form><input type="email" /></form>`;
    const el = first<HTMLInputElement>(['input[name="email"]', 'input[type="email"]'])!;
    let fired = false;
    el.addEventListener('input', () => (fired = true));
    setInputValue(el, 'a@corp.example');
    expect(el.value).toBe('a@corp.example');
    expect(fired).toBe(true);
  });
});
