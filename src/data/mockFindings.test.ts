import { expect, test } from 'vitest'
import { OWASP_VULNS } from './owasp'
import { MOCK_FINDINGS } from './mockFindings'

test('cubre las 10 vulns (A10 con cero hallazgos)', () => {
  for (const v of OWASP_VULNS) expect(Array.isArray(MOCK_FINDINGS[v.id])).toBe(true);
  expect(MOCK_FINDINGS['A10']).toHaveLength(0);
});
test('todos los hallazgos tienen campos completos y severidad válida', () => {
  const all = Object.values(MOCK_FINDINGS).flat();
  expect(all.length).toBeGreaterThanOrEqual(10);
  for (const f of all) {
    expect(['critical','high','medium','low']).toContain(f.severity);
    for (const key of ['id','vulnId','title','file','snippet','exploit','consequences','solution'] as const)
      expect(String(f[key]).trim()).not.toBe('');
    expect(f.line).toBeGreaterThanOrEqual(1);
  }
});
test('hay al menos 3 hallazgos críticos', () => {
  const all = Object.values(MOCK_FINDINGS).flat();
  expect(all.filter(f => f.severity === 'critical').length).toBeGreaterThanOrEqual(3);
});
