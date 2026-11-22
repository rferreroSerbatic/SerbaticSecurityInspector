import { expect, test } from 'vitest'
import { OWASP_VULNS } from './owasp'

test('OWASP_VULNS son exactamente las 10, en orden A01..A10', () => {
  expect(OWASP_VULNS).toHaveLength(10)
  expect(OWASP_VULNS.map(v => v.id)).toEqual(['A01','A02','A03','A04','A05','A06','A07','A08','A09','A10'])
})
test('cada vuln tiene name, icon y description no vacíos', () => {
  for (const v of OWASP_VULNS) {
    expect(v.name.trim()).not.toBe('')
    expect(v.icon.trim()).not.toBe('')
    expect(v.description.trim()).not.toBe('')
  }
})

test('cada vuln tiene un cve real (formato CVE-AAAA-NNNNN) y todos son únicos', () => {
  const cves = OWASP_VULNS.map(v => v.cve)
  for (const cve of cves) {
    expect(cve).toMatch(/^CVE-\d{4}-\d{4,}$/)
  }
  expect(new Set(cves).size).toBe(cves.length)
})
