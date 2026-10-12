import { describe, it, expect } from 'vitest';
import { parseRoster, renderKeyName, rosterToCsv, isAllowed, normalizeDomains } from '../utils/roster';
import { canTransition, transition } from '../utils/flow';

describe('parseRoster', () => {
  it('过滤非公司域名并去重', () => {
    const csv = '姓名,邮箱,部门\n张三,zs@corp.example,研发\n李四,ls@gmail.com,产品\n张三,ZS@corp.example,研发';
    const r = parseRoster(csv, ['corp.example']);
    expect(r.added).toHaveLength(1);
    expect(r.rejected.map((x) => x.reason)).toEqual(['非公司域名', '重复邮箱']);
  });
  it('与已有名单去重，支持引号与 BOM', () => {
    const existing = parseRoster('王五,ww@corp.example,', ['corp.example']).added;
    const r = parseRoster('\uFEFF"赵, 六",zl@corp.example,"市场"\n王五,WW@corp.example,', ['@Corp.Example'], existing);
    expect(r.added.map((c) => c.name)).toEqual(['赵, 六']);
    expect(r.rejected[0].reason).toBe('重复邮箱');
  });
  it('格式错误', () => {
    expect(parseRoster('无邮箱,,', ['corp.example']).rejected[0].reason).toBe('格式错误');
  });
});

describe('helpers', () => {
  it('域名校验', () => {
    expect(isAllowed('a@corp.example', ['corp.example'])).toBe(true);
    expect(isAllowed('a@sub.corp.example', ['corp.example'])).toBe(false);
    expect(normalizeDomains('a.com, @B.com；a.com')).toEqual(['a.com', 'b.com']);
  });
  it('Key 命名', () => {
    expect(renderKeyName('{name}-{dept}', { name: '张三', dept: '研发', email: 'zs@x.com' })).toBe('张三-研发');
    expect(renderKeyName('{name}-{dept}', { name: '张三', email: 'zs@x.com' })).toBe('张三');
    expect(renderKeyName('{user}', { name: '张三', email: 'zs@x.com' })).toBe('zs');
  });
  it('导出 CSV 不含 Key', () => {
    const r = parseRoster('张三,zs@corp.example,研发', ['corp.example']).added;
    const out = rosterToCsv(r);
    expect(out).toContain('zs@corp.example');
    expect(out).not.toContain('apx_live_');
  });
});

describe('flow', () => {
  it('不允许跳步', () => {
    expect(canTransition('pending', 'key_captured')).toBe(false);
    expect(canTransition('pending', 'filling')).toBe(true);
    expect(canTransition('delivered', 'pending')).toBe(false);
    expect(() => transition('pending', 'signed_in')).toThrow();
  });
});
