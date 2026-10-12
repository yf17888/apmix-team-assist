export type Status =
  | 'pending' | 'filling' | 'awaiting_link' | 'signed_in'
  | 'key_captured' | 'delivered' | 'failed';

export interface Colleague {
  name: string;
  email: string;
  dept?: string;
  status: Status;
  note?: string;
  updatedAt: string;
}

const EMAIL_RE = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;

export function domainOf(email: string): string | null {
  const m = EMAIL_RE.exec(email.trim().toLowerCase());
  return m ? m[1] : null;
}

/** 解析 CSV（姓名,邮箱,部门），按白名单域名过滤并按邮箱去重 */
export function parseRoster(
  csv: string,
  allowedDomains: string[],
  existing: Colleague[] = [],
): { added: Colleague[]; rejected: { line: string; reason: string }[] } {
  const allow = new Set(allowedDomains.map((d) => d.toLowerCase().trim()));
  const seen = new Set(existing.map((c) => c.email.toLowerCase()));
  const added: Colleague[] = [];
  const rejected: { line: string; reason: string }[] = [];
  for (const raw of csv.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^姓名|^name/i.test(line)) continue;
    const [name = '', email = '', dept = ''] = line.split(',').map((s) => s.trim());
    const domain = domainOf(email);
    if (!name || !domain) { rejected.push({ line, reason: '格式错误' }); continue; }
    if (!allow.has(domain)) { rejected.push({ line, reason: '非公司域名' }); continue; }
    const key = email.toLowerCase();
    if (seen.has(key)) { rejected.push({ line, reason: '重复邮箱' }); continue; }
    seen.add(key);
    added.push({ name, email: key, dept: dept || undefined, status: 'pending', updatedAt: new Date().toISOString() });
  }
  return { added, rejected };
}
