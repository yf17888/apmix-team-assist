export const API_HOST = 'https://api.apmix.ai';

export interface Configs {
  claudeCode: string;
  codex: string;
  cursor: string;
  curl: string;
}

export function buildConfigs(key: string): Configs {
  return {
    claudeCode: `export ANTHROPIC_BASE_URL=${API_HOST}\nexport ANTHROPIC_API_KEY=${key}`,
    codex: `export OPENAI_BASE_URL=${API_HOST}/v1\nexport OPENAI_API_KEY=${key}`,
    cursor: `Cursor → Settings → Models → OpenAI API Key: ${key}\nOverride OpenAI Base URL: ${API_HOST}/v1`,
    curl: `curl ${API_HOST}/v1/models -H "Authorization: Bearer ${key}"`,
  };
}

export function buildHandoff(name: string, email: string, key: string): string {
  const c = buildConfigs(key);
  return [
    `# apmix 账号交付 · ${name} <${email}>`,
    '',
    '请妥善保管，Key 只显示这一次，勿外传。',
    '',
    `API Key: ${key}`,
    '',
    '## Claude Code',
    c.claudeCode,
    '',
    '## Codex CLI / OpenAI SDK',
    c.codex,
    '',
    '## Cursor',
    c.cursor,
    '',
    '## 连通性测试',
    c.curl,
    '',
  ].join('\n');
}

export function maskKey(key: string): string {
  return key.length > 14 ? `${key.slice(0, 9)}••••${key.slice(-4)}` : '••••';
}

export async function testKey(key: string, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; detail: string }> {
  try {
    const r = await fetchImpl(`${API_HOST}/v1/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
    const j = (await r.json()) as { data?: unknown[] };
    return { ok: true, detail: `可用模型 ${Array.isArray(j.data) ? j.data.length : 0} 个` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
