import { describe, it, expect } from 'vitest';
import { parseRoster } from '../utils/roster';
import { canTransition } from '../utils/flow';

describe('parseRoster', () => {
  it('过滤非公司域名并去重', () => {
    const csv = '姓名,邮箱,部门\n张三,zs@corp.example,研发\n李四,ls@gmail.com,产品\n张三,ZS@corp.example,研发';
    const r = parseRoster(csv, ['corp.example']);
    expect(r.added).toHaveLength(1);
    expect(r.rejected.map((x) => x.reason)).toEqual(['非公司域名', '重复邮箱']);
  });
});

describe('flow', () => {
  it('不允许跳步', () => {
    expect(canTransition('pending', 'key_captured')).toBe(false);
    expect(canTransition('pending', 'filling')).toBe(true);
  });
});
