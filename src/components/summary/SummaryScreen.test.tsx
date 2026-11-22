import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AnalysisProgress, Finding } from '../../types'
import { SummaryScreen } from './SummaryScreen'

afterEach(cleanup)

// AnalysisProgress fabricado (pinned por el brief de la Task 12):
// 4 hallazgos, uno por severidad (1 critical, 1 high, 1 medium, 1 low),
// 4 agentes y meta {128 archivos, 3412 líneas, 14 min}.
const findings: Finding[] = [
  {
    id: 'A01-1',
    vulnId: 'A01',
    severity: 'critical',
    title: 'IDOR: perfil de cualquier usuario accesible sin comprobar el propietario',
    file: 'src/controllers/users.ts',
    line: 42,
    snippet: 'res.json(user.rows[0]) // sin verificar que req.user.id === user.id',
    exploit: 'Cambiar el parámetro (GET /api/users/1024) expone el perfil, el email y el teléfono de cualquier usuario.',
    consequences: 'Exposición masiva de datos personales de clientes e incumplimiento del RGPD.',
    solution: 'Comprobar que el usuario autenticado es el propietario del recurso y devolver 403/404.',
  },
  {
    id: 'A03-1',
    vulnId: 'A03',
    severity: 'high',
    title: 'SQL injection en get_orders()',
    file: 'api/users.py',
    line: 128,
    snippet: 'cursor.execute(f"SELECT * FROM orders WHERE user = {user_id}")',
    exploit: 'Enviar user_id = 1 OR 1=1-- devuelve el contenido completo de la tabla.',
    consequences: 'Lectura y manipulación de datos ajenos: pedidos, credenciales y facturación.',
    solution: 'Usar una consulta parametrizada: cursor.execute("… WHERE user = %s", (user_id,))',
  },
  {
    id: 'A02-1',
    vulnId: 'A02',
    severity: 'medium',
    title: 'API key en texto plano',
    file: '.env',
    line: 3,
    snippet: 'STRIPE_KEY=sk_live_4eC39HqLyjWDarjtT1zdp7dc',
    exploit: 'Cualquier persona con acceso al repo obtiene la clave y opera sobre la pasarela de pagos.',
    consequences: 'Carga financiera directa sobre la cuenta del cliente y cargos fraudulentos.',
    solution: 'Mover la clave a un gestor de secretos y rotarla de inmediato.',
  },
  {
    id: 'A09-1',
    vulnId: 'A09',
    severity: 'low',
    title: 'Sin logs de eventos de seguridad',
    file: 'main.py',
    line: 12,
    snippet: 'app.run(debug=True)  # sin logging de intentos de acceso fallidos',
    exploit: 'El atacante prueba credenciales y endpoints sin dejar rastro que investigar.',
    consequences: 'Los incidentes pasan desapercibidos hasta que es demasiado tarde.',
    solution: 'Añadir logging estructurado de autenticación y auditoría de accesos.',
  },
]

const base: AnalysisProgress = {
  status: 'done',
  globalProgress: 100,
  agents: findings.map(f => ({ vulnId: f.vulnId, status: 'done' as const, progress: 100 })),
  logLines: [],
  findings,
  meta: { files: 128, lines: 3412, durationMin: 14 },
}

const renderScreen = (
  analysis: AnalysisProgress = base,
  selectedFindingIds: string[] = [],
  handlers: {
    onToggleFinding?: (id: string) => void
    onSetAllFindings?: (ids: string[]) => void
    onGenerateScope?: () => void
    onNewAudit?: () => void
    onBack?: () => void
  } = {},
  demoBaseUrl?: string,
  projectName?: string,
) =>
  render(
    <SummaryScreen
      analysis={analysis}
      selectedFindingIds={selectedFindingIds}
      onToggleFinding={handlers.onToggleFinding ?? (() => {})}
      onSetAllFindings={handlers.onSetAllFindings ?? (() => {})}
      onGenerateScope={handlers.onGenerateScope ?? (() => {})}
      onNewAudit={handlers.onNewAudit ?? (() => {})}
      onBack={handlers.onBack ?? (() => {})}
      demoBaseUrl={demoBaseUrl}
      projectName={projectName}
    />,
  )

test('renderiza las métricas y la barra de severidad con sus segmentos', () => {
  const { container } = renderScreen()
  expect(container.querySelector('[style*="radial-gradient"]')).not.toBeInTheDocument()

  expect(screen.getByText('Análisis completado')).toBeInTheDocument()
  expect(screen.getByText('4 agentes · 128 archivos · 3.412 líneas · 14 min')).toBeInTheDocument()

  // 1 de cada severidad sobre 4 hallazgos → 4 segmentos del 25% en orden crítico→bajo
  const segments = screen.getAllByTestId('sev-segment')
  expect(segments).toHaveLength(4)
  expect(segments.map(s => s.style.width)).toEqual(['25%', '25%', '25%', '25%'])

  expect(screen.getByText('1 CRÍTICO')).toBeInTheDocument()
  expect(screen.getByText('1 ALTO')).toBeInTheDocument()
  expect(screen.getByText('1 MEDIO')).toBeInTheDocument()
  expect(screen.getByText('1 BAJO')).toBeInTheDocument()
})

test('la meta muestra modelo y velocidad media cuando el backend los manda', () => {
  const live: AnalysisProgress = {
    ...base,
    meta: { files: 128, lines: 3412, durationMin: 14, model: 'qwen3.8-fp8', totalTokens: 1234, avgTps: 38.5 },
  }
  renderScreen(live)
  expect(screen.getByText(/qwen3\.8-fp8/)).toBeInTheDocument()
  expect(screen.getByText(/38\.5 tk\/s/)).toBeInTheDocument()
})

test('los hallazgos renderizan con badge, tag OWASP y file:line', () => {
  renderScreen()

  // badges de severidad
  expect(screen.getByText('CRÍTICO')).toBeInTheDocument()
  expect(screen.getByText('ALTO')).toBeInTheDocument()
  expect(screen.getByText('MEDIO')).toBeInTheDocument()
  expect(screen.getByText('BAJO')).toBeInTheDocument()

  // tag «A0X · NOMBRE VULN»
  expect(screen.getByText('A01 · FALLOS DE CONTROL DE ACCESO')).toBeInTheDocument()
  expect(screen.getByText('A03 · INYECCIÓN')).toBeInTheDocument()
  expect(screen.getByText('A02 · FALLOS CRIPTOGRÁFICOS')).toBeInTheDocument()
  expect(screen.getByText('A09 · REGISTRO Y MONITORIZACIÓN')).toBeInTheDocument()

  // títulos
  expect(screen.getByText('SQL injection en get_orders()')).toBeInTheDocument()
  expect(screen.getByText('API key en texto plano')).toBeInTheDocument()

  // ubicación: el crítico (expandido) en su bloque de código; los colapsados en su fila
  expect(screen.getByText('📍 src/controllers/users.ts:42')).toBeInTheDocument()
  expect(screen.getByText('api/users.py:128')).toBeInTheDocument()
  expect(screen.getByText('.env:3')).toBeInTheDocument()
  expect(screen.getByText('main.py:12')).toBeInTheDocument()
})

test('expandir un hallazgo muestra exploit, consecuencias y solución', () => {
  renderScreen()

  const high = findings[1]
  expect(screen.queryByText(high.exploit)).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de A03-1' }))

  expect(screen.getByText(high.exploit)).toBeInTheDocument()
  expect(screen.getByText(high.consequences)).toBeInTheDocument()
  expect(screen.getByText(high.solution)).toBeInTheDocument()
})

test('el primer hallazgo crítico está expandido por defecto', () => {
  renderScreen()

  expect(screen.getByText(findings[0].exploit)).toBeInTheDocument()
  expect(screen.queryByText(findings[1].exploit)).not.toBeInTheDocument()

  expect(screen.getByRole('button', { name: 'Ver detalle de A01-1' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  expect(screen.getByRole('button', { name: 'Ver detalle de A03-1' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
})

test('marcar hallazgos actualiza el contador del pie y habilita generar', () => {
  const onToggleFinding = vi.fn()
  const { rerender } = renderScreen(base, [], { onToggleFinding })

  expect(screen.getByText('0 DE 4 HALLAZGOS MARCADOS PARA EL ALCANCE')).toBeInTheDocument()
  const generar = screen.getByRole('button', { name: /generar alcance/i })
  expect(generar).toBeDisabled()

  fireEvent.click(
    screen.getByRole('checkbox', { name: `A03-1 ${findings[1].title}` }),
  )
  expect(onToggleFinding).toHaveBeenCalledOnce()
  expect(onToggleFinding).toHaveBeenCalledWith('A03-1')

  rerender(
    <SummaryScreen
      analysis={base}
      selectedFindingIds={['A03-1']}
      onToggleFinding={onToggleFinding}
      onSetAllFindings={() => {}}
      onGenerateScope={() => {}}
      onNewAudit={() => {}}
      onBack={() => {}}
    />,
  )

  expect(screen.getByText('1 DE 4 HALLAZGOS MARCADOS PARA EL ALCANCE')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /generar alcance/i })).toBeEnabled()
})

test('el label del checkbox de hallazgo lleva anillo de foco visible para teclado', () => {
  renderScreen()
  const label = screen
    .getByRole('checkbox', { name: `A01-1 ${findings[0].title}` })
    .closest('label')
  expect(label).not.toBeNull()
  // jsdom no implementa :focus-visible; se afirma la clase estática en el wrapper.
  expect(label).toHaveClass('has-[:focus-visible]:ring-2', 'has-[:focus-visible]:ring-neon-cyan')
})

test('con 0 hallazgos muestra el estado vacío y generar está deshabilitado', () => {
  const empty: AnalysisProgress = { ...base, findings: [] }
  renderScreen(empty)

  expect(
    screen.getByText('Sin hallazgos para las vulnerabilidades seleccionadas.'),
  ).toBeInTheDocument()
  expect(screen.queryAllByTestId('finding-card')).toHaveLength(0)
  expect(screen.queryAllByTestId('sev-segment')).toHaveLength(0)
  expect(screen.getByText('0 DE 0 HALLAZGOS MARCADOS PARA EL ALCANCE')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /generar alcance/i })).toBeDisabled()
})

test('los segmentos de la barra solo se pintan si su recuento es > 0', () => {
  const onlyCriticalAndHigh: AnalysisProgress = {
    ...base,
    findings: [findings[0], findings[1]],
  }
  renderScreen(onlyCriticalAndHigh)

  const segments = screen.getAllByTestId('sev-segment')
  expect(segments).toHaveLength(2)
  expect(segments.map(s => s.style.width)).toEqual(['50%', '50%'])
})

test('sin críticos, el primer hallazgo queda expandido por defecto', () => {
  const noCritical: AnalysisProgress = {
    ...base,
    findings: [findings[1], findings[2], findings[3]],
  }
  renderScreen(noCritical)

  expect(screen.getByText(findings[1].exploit)).toBeInTheDocument()
  expect(screen.queryByText(findings[2].exploit)).not.toBeInTheDocument()
})

test('«← Volver» llama a onBack', () => {
  const onBack = vi.fn()
  renderScreen(base, [], { onBack })
  fireEvent.click(screen.getByRole('button', { name: /← volver/i }))
  expect(onBack).toHaveBeenCalled()
})

// --- QA-iter 1 (usuario): enlaces «ver en la demo» a la web de ejemplo ejecutable ---
test('con demoBaseUrl, cada hallazgo enlaza a su sección de la demo', () => {
  renderScreen(base, [], {}, 'http://localhost:3000')
  const links = screen.getAllByRole('link', { name: /ver en la demo/i })
  expect(links).toHaveLength(4)
  expect(links[0]).toHaveAttribute('href', 'http://localhost:3000#A01')
  expect(links.some(l => l.getAttribute('href') === 'http://localhost:3000#A03')).toBe(true)
  expect(links.some(l => l.getAttribute('href') === 'http://localhost:3000#A02')).toBe(true)
})

test('sin demoBaseUrl no hay enlaces de demo (proyectos sin web de ejemplo)', () => {
  renderScreen()
  expect(screen.queryAllByRole('link', { name: /ver en la demo/i })).toHaveLength(0)
})

test('GENERAR ALCANCE llama a onGenerateScope y NUEVA AUDITORÍA llama a onNewAudit', () => {
  const onGenerateScope = vi.fn()
  const onNewAudit = vi.fn()
  renderScreen(base, ['A01-1'], { onGenerateScope, onNewAudit })

  fireEvent.click(screen.getByRole('button', { name: /generar alcance/i }))
  expect(onGenerateScope).toHaveBeenCalledOnce()

  fireEvent.click(screen.getByRole('button', { name: /nueva auditoría/i }))
  expect(onNewAudit).toHaveBeenCalledOnce()
})

// --- Task 8: informe PDF completo (endpoint de la Task 6) + tag de duplicados ---
afterEach(() => vi.unstubAllGlobals())

test('INFORME PDF: POST a /api/reports/full-pdf con {projectName, profile, meta, findings} y descarga', async () => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response('%PDF-1.4 fake', { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  const createObjectURL = vi.fn(() => 'blob:mock')
  URL.createObjectURL = createObjectURL
  URL.revokeObjectURL = vi.fn()

  const withProfile: AnalysisProgress = {
    ...base,
    profile: { stack: 'node', framework: 'express' },
  }
  renderScreen(withProfile, [], {}, undefined, 'Mi Proyecto')

  // Timers falsos: jsdom no implementa `download` y tras el click del ancla
  // programaría una navegación «no implementada» vía setTimeout (mismo
  // patrón que ScopeModal.test con el PDF del alcance).
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: /informe pdf/i }))
  await act(async () => {})
  vi.useRealTimers()

  expect(fetchMock).toHaveBeenCalledOnce()
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/reports/full-pdf')
  expect(init?.method).toBe('POST')
  expect(JSON.parse(init?.body as string)).toEqual({
    projectName: 'Mi Proyecto',
    profile: { stack: 'node', framework: 'express' },
    meta: base.meta,
    findings,
  })
  expect(createObjectURL).toHaveBeenCalled()
})

test('INFORME PDF está deshabilitado sin hallazgos', () => {
  const empty: AnalysisProgress = { ...base, findings: [] }
  renderScreen(empty)
  expect(screen.getByRole('button', { name: /informe pdf/i })).toBeDisabled()
})

test('INFORME PDF muestra el error sin lanzar cuando el backend devuelve 500', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
  renderScreen()

  fireEvent.click(screen.getByRole('button', { name: /informe pdf/i }))
  await act(async () => {})

  expect(screen.getByText('No se pudo generar el informe (¿backend caído?)')).toBeInTheDocument()
})

test('duplicados entre categorías: tag +N con title listando las demás categorías', () => {
  const duped: AnalysisProgress = {
    ...base,
    findings: findings.map(f =>
      f.id === 'A02-1' ? { ...f, alsoCategories: ['A05', 'A06'] } : f,
    ),
  }
  renderScreen(duped)

  const tag = screen.getByText('+2')
  expect(tag).toHaveAttribute('title', 'También reportado por: A05, A06')
})

// --- Task 3 (Fase 2c): orden (criticidad | tipo) + marcar/desmarcar todos ---
const mixed: Finding[] = [findings[3], findings[0], findings[1], findings[2]] // low, critical, high, medium

const cardTitles = () =>
  screen.getAllByTestId('finding-card').map(c => c.textContent ?? '')

test('por defecto, orden por criticidad (el más crítico arriba)', () => {
  renderScreen({ ...base, findings: mixed })
  const t = cardTitles()
  expect(t[0]).toContain('IDOR')
  expect(t[1]).toContain('SQL injection')
  expect(t[2]).toContain('API key')
  expect(t[3]).toContain('Sin logs')
})

test('orden «TIPO»: grupos A01→A10; dentro del grupo, por criticidad', () => {
  const extraA03: Finding = { ...findings[1], id: 'A03-2', severity: 'low', title: 'Otro hallazgo A03' }
  const list: Finding[] = [extraA03, findings[3], findings[0], findings[2], findings[1]]
  renderScreen({ ...base, findings: list })
  fireEvent.click(screen.getByRole('button', { name: 'TIPO' }))
  const t = cardTitles()
  expect(t[0]).toContain('IDOR') // A01
  expect(t[1]).toContain('API key') // A02
  expect(t[2]).toContain('SQL injection') // A03 high (antes que el low)
  expect(t[3]).toContain('Otro hallazgo A03') // A03 low
  expect(t[4]).toContain('Sin logs') // A09
})

test('conmutar el orden re-renderiza la lista en ambos sentidos', () => {
  renderScreen({ ...base, findings: mixed }) // [low A09, critical A01, high A03, medium A02]
  // criticidad (default): critical → high → medium → low
  expect(cardTitles()[0]).toContain('IDOR')
  expect(cardTitles()[1]).toContain('SQL injection')
  expect(cardTitles()[2]).toContain('API key')
  expect(cardTitles()[3]).toContain('Sin logs')
  // tipo: A01 → A02 → A03 → A09
  fireEvent.click(screen.getByRole('button', { name: 'TIPO' }))
  expect(cardTitles()[0]).toContain('IDOR')
  expect(cardTitles()[1]).toContain('API key')
  expect(cardTitles()[2]).toContain('SQL injection')
  expect(cardTitles()[3]).toContain('Sin logs')
  // de vuelta a criticidad
  fireEvent.click(screen.getByRole('button', { name: 'CRITICIDAD' }))
  expect(cardTitles()[0]).toContain('IDOR')
  expect(cardTitles()[1]).toContain('SQL injection')
  expect(cardTitles()[2]).toContain('API key')
})

test('MARCAR TODOS / DESMARCAR TODOS (alcance)', () => {
  const onSetAllFindings = vi.fn()
  const { rerender } = render(
    <SummaryScreen
      analysis={base}
      selectedFindingIds={[]}
      onToggleFinding={() => {}}
      onSetAllFindings={onSetAllFindings}
      onGenerateScope={() => {}}
      onNewAudit={() => {}}
      onBack={() => {}}
    />,
  )
  expect(screen.getByText('0 DE 4 HALLAZGOS MARCADOS PARA EL ALCANCE')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /marcar todos/i }))
  expect(onSetAllFindings).toHaveBeenCalledWith(['A01-1', 'A03-1', 'A02-1', 'A09-1'])

  rerender(
    <SummaryScreen
      analysis={base}
      selectedFindingIds={['A01-1', 'A03-1', 'A02-1', 'A09-1']}
      onToggleFinding={() => {}}
      onSetAllFindings={onSetAllFindings}
      onGenerateScope={() => {}}
      onNewAudit={() => {}}
      onBack={() => {}}
    />,
  )
  expect(screen.getByText('4 DE 4 HALLAZGOS MARCADOS PARA EL ALCANCE')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /desmarcar todos/i }))
  expect(onSetAllFindings).toHaveBeenLastCalledWith([])
})

test('con 0 hallazgos, MARCAR TODOS está deshabilitado', () => {
  renderScreen({ ...base, findings: [] })
  expect(screen.getByRole('button', { name: /marcar todos/i })).toBeDisabled()
})
