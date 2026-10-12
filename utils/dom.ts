export function first<T extends Element>(selectors: string[], root: ParentNode = document): T | null {
  for (const s of selectors) {
    const el = root.querySelector<T>(s);
    if (el) return el;
  }
  return null;
}

/** 以 React/Vue 能识别的方式写入输入框 */
export function setInputValue(el: HTMLInputElement, value: string): void {
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    ?? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function ensureChecked(el: Element): boolean {
  if (el instanceof HTMLInputElement) {
    if (!el.checked) el.click();
    return el.checked;
  }
  if (el.getAttribute('aria-checked') !== 'true') (el as HTMLElement).click();
  return el.getAttribute('aria-checked') === 'true';
}

export function findButtonByText(re: RegExp, root: ParentNode = document): HTMLElement | null {
  const list = root.querySelectorAll<HTMLElement>('button, [role="button"], a');
  for (const b of list) if (re.test(b.textContent ?? '')) return b;
  return null;
}

export function pageText(root: Document | HTMLElement = document): string {
  const body = root instanceof Document ? root.body : root;
  return body?.innerText || body?.textContent || '';
}

export function highlight(el: HTMLElement | null): void {
  if (!el) return;
  el.style.outline = '3px solid #7c5cff';
  el.style.outlineOffset = '4px';
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}
