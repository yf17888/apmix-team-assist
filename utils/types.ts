export type Status =
  | 'pending' | 'filling' | 'awaiting_link' | 'signed_in'
  | 'key_captured' | 'delivered' | 'failed';

export const STATUS_LABEL: Record<Status, string> = {
  pending: '待开始',
  filling: '待提交',
  awaiting_link: '待登录链接',
  signed_in: '已登录',
  key_captured: '已取得 Key',
  delivered: '已交付',
  failed: '失败',
};

export interface Colleague {
  name: string;
  email: string;
  dept?: string;
  status: Status;
  note?: string;
  keyName?: string;
  /** 页面上未核对到该邮箱时置 true，提醒人工确认 */
  emailUnverified?: boolean;
  updatedAt: string;
}

export type Mode = 'self' | 'admin';

export interface Settings {
  allowedDomains: string[];
  keyNameTemplate: string;
  mode: Mode;
}

export const DEFAULT_SETTINGS: Settings = {
  allowedDomains: [],
  keyNameTemplate: '{name}-{dept}',
  mode: 'self',
};

export interface CurrentTask {
  email: string;
  tabId?: number;
  startedAt: string;
  linkSentAt?: string;
}

export interface EncryptedBlob {
  iv: string;
  data: string;
}

export interface VaultMeta {
  salt: string;
  check: EncryptedBlob;
}

export interface AppState {
  roster: Colleague[];
  settings: Settings;
  task: CurrentTask | null;
  vaultReady: boolean;
  unlocked: boolean;
  keys: string[];
  pendingKey: boolean;
}
