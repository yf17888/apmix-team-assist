export const API_HOST = 'https://api.apmix.ai';

export function buildConfigs(key: string) {
  return {
    claudeCode: `export ANTHROPIC_BASE_URL=${API_HOST}\nexport ANTHROPIC_API_KEY=${key}`,
    codex: `export OPENAI_BASE_URL=${API_HOST}/v1\nexport OPENAI_API_KEY=${key}`,
    curl: `curl ${API_HOST}/v1/models -H "Authorization: Bearer ${key}"`,
  };
}

export function maskKey(key: string): string {
  return key.length > 14 ? `${key.slice(0, 9)}••••${key.slice(-4)}` : '••••';
}
