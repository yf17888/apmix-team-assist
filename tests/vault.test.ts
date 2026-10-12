import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { createVault, unlockVault, encrypt, decrypt, exportRaw, importRaw } from '../utils/vault';
import { buildConfigs, maskKey, buildHandoff } from '../utils/export';

if (!globalThis.crypto?.subtle) (globalThis as { crypto: unknown }).crypto = webcrypto;

describe('vault', () => {
  it('加解密往返、口令错误被拒', async () => {
    const { meta, key } = await createVault('correct horse');
    const blob = await encrypt(key, 'apx_live_secret123456');
    const k2 = await unlockVault('correct horse', meta);
    expect(await decrypt(k2, blob)).toBe('apx_live_secret123456');
    const k3 = await importRaw(await exportRaw(k2));
    expect(await decrypt(k3, blob)).toBe('apx_live_secret123456');
    await expect(unlockVault('wrong pass', meta)).rejects.toThrow('口令错误');
  });
  it('短口令被拒', async () => {
    await expect(createVault('123')).rejects.toThrow();
  });
});

describe('export', () => {
  it('配置模板', () => {
    const c = buildConfigs('apx_live_abc');
    expect(c.claudeCode).toContain('ANTHROPIC_BASE_URL=https://api.apmix.ai');
    expect(c.codex).toContain('OPENAI_BASE_URL=https://api.apmix.ai/v1');
    expect(maskKey('apx_live_1234567890abcd')).toBe('apx_live_••••abcd');
    expect(buildHandoff('张三', 'zs@x.com', 'apx_live_abc')).toContain('张三');
  });
});
