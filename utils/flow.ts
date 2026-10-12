import type { Status } from './roster';

/** 允许的状态迁移；failed 只能由人工重置回 pending */
const NEXT: Record<Status, Status[]> = {
  pending: ['filling'],
  filling: ['awaiting_link', 'failed'],
  awaiting_link: ['signed_in', 'failed'],
  signed_in: ['key_captured', 'failed'],
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
