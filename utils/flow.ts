import type { Status } from './types';

/** 允许的状态迁移；failed 只能由人工重置回 pending */
const NEXT: Record<Status, Status[]> = {
  pending: ['filling'],
  filling: ['awaiting_link', 'failed', 'pending'],
  awaiting_link: ['signed_in', 'failed', 'pending', 'filling'],
  signed_in: ['key_captured', 'failed', 'pending'],
  key_captured: ['delivered'],
  delivered: [],
  failed: ['pending'],
};

export function canTransition(from: Status, to: Status): boolean {
  return NEXT[from].includes(to);
}

export function transition(from: Status, to: Status): Status {
  if (!canTransition(from, to)) throw new Error(`非法状态迁移: ${from} -> ${to}`);
  return to;
}

/** 正在进行中的状态（同一时间只能有一个人处于这些状态） */
export const ACTIVE: Status[] = ['filling', 'awaiting_link', 'signed_in'];

export const STEP_ORDER: Status[] = ['pending', 'filling', 'awaiting_link', 'signed_in', 'key_captured', 'delivered'];

export function hintFor(status: Status, mode: 'self' | 'admin'): string {
  switch (status) {
    case 'filling':
      return '已填好邮箱并勾选条款。请完成人机验证，然后点击「Send magic link」。';
    case 'awaiting_link':
      return mode === 'admin'
        ? '请让同事把收到的登录链接转给你，粘贴到下方打开。'
        : '请到你的公司邮箱打开 apmix 发来的登录链接（在本浏览器中打开）。';
    case 'signed_in':
      return '已登录。请在 Keys 页点击「Create key」，Key 名已预填。';
    case 'key_captured':
      return 'Key 已加密保存。复制配置交付后，可删除本地 Key。';
    default:
      return '';
  }
}
