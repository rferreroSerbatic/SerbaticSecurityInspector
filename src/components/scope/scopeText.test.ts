import { expect, test } from 'vitest'
import type { Finding } from '../../types'
import { OWASP_VULNS } from '../../data/owasp'
import { buildScopeText } from './scopeText'

// Hallazgos de ejemplo fijados por el brief (Task 13):
// A03 critical, A01 high, A03 medium. El orden de entrada va a propósito
// desordenado (A03 → A01 → A03) para probar el agrupado canónico A01..A10
// y el orden de severidad dentro de cada grupo.
const finding = (
  f: Pick<Finding, 'id' | 'vulnId' | 'severity' | 'title' | 'file' | 'line'>,
): Finding => ({
  snippet: 'código de ejemplo',
  exploit: 'vector de ejemplo',
  consequences: 'impacto de ejemplo',
  solution: 'solución de ejemplo',
  ...f,
})

const a03Crit = finding({
  id: 'A03-1',
  vulnId: 'A03',
  severity: 'critical',
  title: 'SQL injection en get_orders()',
  file: 'api/users.py',
  line: 128,
})
const a01High = finding({
  id: 'A01-1',
  vulnId: 'A01',
  severity: 'high',
  title: 'IDOR: perfil accesible sin comprobar el propietario',
  file: 'src/controllers/users.ts',
  line: 42,
})
const a03Med = finding({
  id: 'A03-2',
  vulnId: 'A03',
  severity: 'medium',
  title: 'Command injection en build_number',
  file: 'api/builds.py',
  line: 77,
})

const findings = [a03Crit, a01High, a03Med]
const PROJECT = 'Plataforma de pagos'
const DATE_ISO = '2026-11-20'

const build = () => buildScopeText(findings, OWASP_VULNS, PROJECT, DATE_ISO)

test('contiene cabecera, proyecto y fecha dd/mm/aaaa', () => {
  const lines = build().split('\n')
  expect(lines[0]).toBe('ALCANCE TÉCNICO DE MEJORA — SEGURIDAD')
  expect(lines[1]).toBe('Proyecto: Plataforma de pagos · 20/11/2026 · Serbatic Security Inspector')
})

test('agrupa por vuln en orden A01..A10 y numera globalmente 1..n', () => {
  const text = build()
  // A01 va antes que A03 pese a entrar después en el array.
  const posA01 = text.indexOf(
    '1. IDOR: PERFIL ACCESIBLE SIN COMPROBAR EL PROPIETARIO (FALLOS DE CONTROL DE ACCESO) — ALTO',
  )
  const posA03Crit = text.indexOf('2. SQL INJECTION EN GET_ORDERS() (INYECCIÓN) — CRÍTICO')
  const posA03Med = text.indexOf('3. COMMAND INJECTION EN BUILD_NUMBER (INYECCIÓN) — MEDIO')

  expect(posA01).toBeGreaterThan(-1)
  expect(posA03Crit).toBeGreaterThan(-1)
  expect(posA03Med).toBeGreaterThan(-1)
  expect(posA01).toBeLessThan(posA03Crit)
  expect(posA03Crit).toBeLessThan(posA03Med)
})

test('cada bloque incluye file:line, label de severidad y estimación/prioridad', () => {
  const text = build()

  // file:line en el bloque de cada hallazgo
  expect(text).toContain('api/users.py:128')
  expect(text).toContain('src/controllers/users.ts:42')
  expect(text).toContain('api/builds.py:77')

  // labels de severidad (mismos que SeverityBadge)
  expect(text).toContain('— CRÍTICO')
  expect(text).toContain('— ALTO')
  expect(text).toContain('— MEDIO')

  // estimación y prioridad según severidad (critical → "4 h" e "inmediata")
  expect(text).toContain('Estimación: 4 h · Prioridad: inmediata')
  expect(text).toContain('Estimación: 3 h · Prioridad: alta')
  expect(text).toContain('Estimación: 2 h · Prioridad: media')

  // cuerpo del bloque: objetivo y validación con el título del hallazgo
  expect(
    text).toContain('Objetivo: eliminar SQL injection en get_orders() detectado en api/users.py.')
  expect(text).toContain(
    '· Revisar la ocurrencia en api/users.py:128 y aplicar la solución recomendada.',
  )
  expect(
    text).toContain('· Validar el cambio con una prueba que cubra el caso de SQL injection en get_orders().')
})

test('con findings vacíos produce la línea de «no se incluyen hallazgos»', () => {
  const text = buildScopeText([], OWASP_VULNS, PROJECT, DATE_ISO)
  expect(text).toBe(
    'ALCANCE TÉCNICO DE MEJORA — SEGURIDAD\n' +
      'Proyecto: Plataforma de pagos · 20/11/2026 · Serbatic Security Inspector\n' +
      'No se incluyen hallazgos en este alcance.',
  )
})

test('un hallazgo con vulnId no conocido en la lista se omite sin romper', () => {
  const desconocido = finding({
    id: 'A99-1',
    vulnId: 'A99',
    severity: 'low',
    title: 'Hallazgo de una vulnerabilidad no catalogada',
    file: 'main.py',
    line: 1,
  })

  // Se omite: el documento no menciona ni el hallazgo ni la vuln desconocida.
  const text = buildScopeText([a01High, desconocido], OWASP_VULNS, PROJECT, DATE_ISO)
  expect(
    text).toContain('1. IDOR: PERFIL ACCESIBLE SIN COMPROBAR EL PROPIETARIO (FALLOS DE CONTROL DE ACCESO) — ALTO')
  expect(text).not.toContain('A99')
  expect(text).not.toContain('no catalogada')

  // Si TODOS los hallazgos son desconocidos, cae en el caso vacío.
  const onlyUnknown = buildScopeText([desconocido], OWASP_VULNS, PROJECT, DATE_ISO)
  expect(onlyUnknown).toContain('No se incluyen hallazgos en este alcance.')
})
