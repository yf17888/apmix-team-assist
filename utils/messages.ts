import type { AppState, Settings } from './types';

export type Msg =
  | { type: 'getState' }
  | { type: 'saveSettings'; settings: Settings }
  | { type: 'importRoster'; csv: string }
  | { type: 'removeColleague'; email: string }
  | { type: 'createVault'; passphrase: string }
  | { type: 'unlock'; passphrase: string }
  | { type: 'lock' }
  | { type: 'startTask'; email: string }
  | { type: 'stopTask' }
  | { type: 'markSent' }
  | { type: 'openLink'; url: string }
  | { type: 'resetColleague'; email: string }
  | { type: 'getKey'; email: string }
  | { type: 'testKey'; email: string }
  | { type: 'markDelivered'; email: string; deleteKey: boolean }
  | { type: 'deleteKey'; email: string }
  | { type: 'clearApmixSession' }
  // 内容脚本 → 后台
  | { type: 'cs:getTask' }
  | { type: 'cs:openPanel' }
  | { type: 'cs:selfStart'; name: string; email: string }
  | { type: 'cs:status' }
  | { type: 'cs:linkSent' }
  | { type: 'cs:rejected'; reason: string }
  | { type: 'cs:keyCaptured'; key: string; emailSeen: boolean };

export type Reply<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export interface CsTaskInfo {
  name: string;
  email: string;
  status: string;
  keyName: string;
  hint: string;
}

export async function send<T = AppState>(msg: Msg): Promise<T> {
  const r = (await browser.runtime.sendMessage(msg)) as Reply<T> | undefined;
  if (!r) throw new Error('后台无响应');
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
