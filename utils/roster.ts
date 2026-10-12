import type { Colleague, Settings } from './types';
export type { Colleague, Status } from './types';

const EMAIL_RE = /^[^\s@,;]+@([^\s@,;]+\.[^\s@,;]+)$/;

export function domainOf(email: string): string | null {
  const m = EMAIL_RE.exec(email.trim().toLowerCase());
  return m ? m[1] : null;
}

export function normalizeDomains(input: string | string[]): string[] {
  const list = Array.isArray(input) ? input : input.split(/[\s,;，；]+/);
  return [...new Set(list.map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];
}

export function isAllowed(email: string, allowedDomains: string[]): boolean {
  const d = domainOf(email);
  return !!d && normalizeDomains(allowedDomains).includes(d);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === '，' || ch === '\t') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** 解析 CSV（姓名,邮箱,部门），按白名单域名过滤并按邮箱去重 */
export function parseRoster(
  csv: string,
  allowedDomains: string[],
  existing: Colleague[] = [],
): { added: Colleague[]; rejected: { line: string; reason: string }[] } {
  const allow = new Set(normalizeDomains(allowedDomains));
  const seen = new Set(existing.map((c) => c.email.toLowerCase()));
  const added: Colleague[] = [];
  const rejected: { line: string; reason: string }[] = [];
  for (const raw of csv.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(姓名|name)\s*[,，\t]/i.test(line)) continue;
    const [name = '', email = '', dept = ''] = splitCsvLine(line);
    const domain = domainOf(email);
    if (!name || !domain) { rejected.push({ line, reason: '格式错误' }); continue; }
    if (!allow.has(domain)) { rejected.push({ line, reason: '非公司域名' }); continue; }
    const key = email.trim().toLowerCase();
    if (seen.has(key)) { rejected.push({ line, reason: '重复邮箱' }); continue; }
    seen.add(key);
    added.push({ name, email: key, dept: dept || undefined, status: 'pending', updatedAt: new Date().toISOString() });
  }
  return { added, rejected };
}

function csvCell(v: string | undefined): string {
  const s = v ?? '';
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 导出名单与状态（不含 Key） */
export function rosterToCsv(roster: Colleague[]): string {
  const head = '姓名,邮箱,部门,状态,备注,更新时间';
  const rows = roster.map((c) =>
    [c.name, c.email, c.dept, c.status, c.note, c.updatedAt].map(csvCell).join(','),
  );
  return [head, ...rows].join('\n');
}

export function renderKeyName(template: string, c: Pick<Colleague, 'name' | 'dept' | 'email'>): string {
  const local = c.email.split('@')[0] ?? '';
  const out = template
    .replace(/\{name\}/g, c.name)
    .replace(/\{dept\}/g, c.dept ?? '')
    .replace(/\{user\}/g, local)
    .replace(/[-_\s]+$/g, '')
    .replace(/^[-_\s]+/g, '')
    .replace(/-{2,}/g, '-');
  return (out || local).slice(0, 48);
}

export function settingsReady(s: Settings): string | null {
  if (!s.allowedDomains.length) return '请先在设置中填写公司邮箱域名';
  return null;
}
