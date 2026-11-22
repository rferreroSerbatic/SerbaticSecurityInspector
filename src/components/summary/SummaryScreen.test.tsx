import { StrictMode } from 'react'
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

// Task 5 (Fase 2d): A01-1 con guía real (ruling «siempre modo real»: el mock no lleva guía).
const withGuide: AnalysisProgress = {
  ...base,
  findings: findings.map(f =>
    f.id === 'A01-1'
      ? { ...f, guide: '## RESUMEN\nSe itera el id sin comprobar propietario.\n## PAYLOAD DE EJEMPLO\n```\nGET /api/users/1024\n```' }
      : f,
  ),
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
  projectName?: string,
  guideProps: {
    canGenerateGuide?: boolean
    projectId?: string
    onGuideReady?: (id: string, guide: string) => void
  } = {},
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
      projectName={projectName}
      canGenerateGuide={guideProps.canGenerateGuide ?? false}
      projectId={guideProps.projectId}
      onGuideReady={guideProps.onGuideReady ?? (() => {})}
    />,
  )

test('cada hallazgo muestra el CVE de su categoría con enlace a su ficha', () => {
  // QA-iter 6: CVE de la categoría, enlazado a cve.org.
  renderScreen()
  const link = screen.getByRole('link', { name: 'CVE-2024-38816' })
  expect(link).toHaveAttribute('href', 'https://www.cve.org/CVERecord?id=CVE-2024-38816')
  expect(link).toHaveAttribute('target', '_blank')
  // QA-iter 7: el CVE con más protagonismo (chip cian, no texto tenue).
  expect(link).toHaveClass('border-neon-cyan/35')
  expect(link).toHaveClass('text-neon-cyan/80')
  // Otros hallazgos de la misma lista: sus CVEs también son enlaces.
  expect(screen.getByRole('link', { name: 'CVE-2021-44228' })).toHaveAttribute(
    'href',
    'https://www.cve.org/CVERecord?id=CVE-2021-44228',
  )
})

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
      canGenerateGuide={false}
      onGuideReady={() => {}}
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

test('EXPORTAR RESULTADOS A PDF: POST a /api/reports/full-pdf y descarga (QA-iter 7: nuevo nombre)', async () => {
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
  renderScreen(withProfile, [], {}, 'Mi Proyecto')

  // Timers falsos: jsdom no implementa `download` y tras el click del ancla
  // programaría una navegación «no implementada» vía setTimeout (mismo
  // patrón que ScopeModal.test con el PDF del alcance).
  vi.useFakeTimers()
  const btn = screen.getByRole('button', { name: /exportar resultados a pdf/i })
  // QA-iter 7: el botón se ve «activo» en hover (variante accent cian).
  expect(btn).toHaveClass('border-neon-cyan/50')
  fireEvent.click(btn)
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

test('EXPORTAR RESULTADOS A PDF está deshabilitado sin hallazgos', () => {
  const empty: AnalysisProgress = { ...base, findings: [] }
  renderScreen(empty)
  expect(screen.getByRole('button', { name: /exportar resultados a pdf/i })).toBeDisabled()
})

test('EXPORTAR RESULTADOS A PDF muestra el error sin lanzar cuando el backend devuelve 500', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
  renderScreen()

  fireEvent.click(screen.getByRole('button', { name: /exportar resultados a pdf/i }))
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
      canGenerateGuide={false}
      onGuideReady={() => {}}
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
      canGenerateGuide={false}
      onGuideReady={() => {}}
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

// --- QA-iter 4 (usuario): MARCAR TODOS visible en la fila de control (antes enterrado en el pie) ---
test('MARCAR TODOS está en la fila de control superior (no en el footer) y con borde visible', () => {
  renderScreen()
  const btn = screen.getByRole('button', { name: /marcar todos/i })
  expect(btn.closest('footer')).not.toBeInTheDocument()
  expect(btn).toHaveClass('border')
})

// --- Task 5 (Fase 2d): botón «CÓMO EXPLOTAR» + modal de guía (solo con guía real) ---
test('botón CÓMO EXPLOTAR solo en hallazgos con guía (ruling: siempre modo real)', () => {
  renderScreen() // fixture base: sin guide → sin botón
  expect(screen.queryAllByTestId('exploit-guide-btn')).toHaveLength(0)
  cleanup()
  renderScreen(withGuide) // A01-1 (crítico) expandido por defecto → 1 botón
  expect(screen.getAllByTestId('exploit-guide-btn')).toHaveLength(1)
})

test('abre el modal de la guía y se cierra con CERRAR', () => {
  renderScreen(withGuide)
  fireEvent.click(screen.getByTestId('exploit-guide-btn'))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByText('RESUMEN')).toBeInTheDocument()
  expect(screen.getByText('GET /api/users/1024')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('guide-close'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

// --- Fase 2d.1: guía bajo demanda (al pinchar) + export con projectId ---

test('live: botón CÓMO EXPLOTAR también en hallazgos sin guía (se genera al pinchar)', () => {
  renderScreen(base, [], {}, 'P', { canGenerateGuide: true })
  // A01-1 (crítico, expandido por defecto) no lleva guía -> aun así hay botón
  expect(screen.getAllByTestId('exploit-guide-btn')).toHaveLength(1)
})

test('pinchar sin guía: POST /api/guides, estado de carga y luego contenido', async () => {
  const guide = '## RESUMEN\nguía generada al vuelo\n## PAYLOAD DE EJEMPLO\n```\nGET /api/users/1024\n```'
  const fetchMock = vi.fn(async (url: string, _init: RequestInit) =>
    url === '/api/guides'
      ? new Response(JSON.stringify({ guide }), { status: 200 })
      : new Response(null, { status: 404 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  const onGuideReady = vi.fn()
  renderScreen(base, [], {}, 'P', { canGenerateGuide: true, projectId: 'miniapp', onGuideReady })

  fireEvent.click(screen.getByTestId('exploit-guide-btn'))
  expect(screen.getByTestId('guide-loading')).toBeInTheDocument()

  await act(async () => {})
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
  expect(body.projectId).toBe('miniapp')
  expect(body.finding).toEqual(base.findings[0])
  expect(onGuideReady).toHaveBeenCalledWith('A01-1', guide)
  expect(screen.getByText('RESUMEN')).toBeInTheDocument()
  expect(screen.getByTestId('guide-close')).toBeInTheDocument()
})

test('pinchar sin guía y fallo: estado error + REINTENTAR regenera', async () => {
  const guide = '## RESUMEN\nguía tras reintento'
  let calls = 0
  const fetchMock = vi.fn(async () => {
    calls += 1
    return calls === 1
      ? new Response(null, { status: 502 })
      : new Response(JSON.stringify({ guide }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  renderScreen(base, [], {}, 'P', { canGenerateGuide: true, projectId: 'miniapp' })

  fireEvent.click(screen.getByTestId('exploit-guide-btn'))
  await act(async () => {})
  expect(screen.getByTestId('guide-error')).toBeInTheDocument()

  fireEvent.click(screen.getByTestId('guide-retry'))
  await act(async () => {})
  expect(screen.getByText('RESUMEN')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('export live: el body de full-pdf lleva projectId', async () => {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response('%PDF-1.4 fake', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  renderScreen(base, [], {}, 'Mi Proyecto', { projectId: 'miniapp' })
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: /exportar resultados a pdf/i }))
  await act(async () => {})
  vi.useRealTimers()
  const [, init] = fetchMock.mock.calls[0]
  expect(JSON.parse(init.body as string).projectId).toBe('miniapp')
})

test('export: 404 con projectId -> reintento sin projectId + nota (proyecto no resoluble)', async () => {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = init ? JSON.parse(init.body as string) : {}
    return body.projectId
      ? new Response(null, { status: 404 })
      : new Response('%PDF-1.4 fake', { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  renderScreen(base, [], {}, 'P', { projectId: 'miniapp' })
  vi.useFakeTimers()
  fireEvent.click(screen.getByRole('button', { name: /exportar resultados a pdf/i }))
  await act(async () => {})
  vi.useRealTimers()
  expect(fetchMock).toHaveBeenCalledTimes(2)
  const first = JSON.parse(fetchMock.mock.calls[0][1].body as string)
  const second = JSON.parse(fetchMock.mock.calls[1][1].body as string)
  expect(first.projectId).toBe('miniapp')
  expect(second.projectId).toBeUndefined()
  expect(URL.createObjectURL).toHaveBeenCalled()
  expect(screen.getByText('Informe exportado sin las guías pendientes (el proyecto ya no está disponible)'))
    .toBeInTheDocument()
})

test('unmount durante la carga: la guia tardia no toca el estado compartido', async () => {
  let resolveGuide: (r: Response) => void = () => {}
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>(res => {
        resolveGuide = res
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  const onGuideReady = vi.fn()
  const { unmount } = renderScreen(base, [], {}, 'P', {
    canGenerateGuide: true,
    projectId: 'miniapp',
    onGuideReady,
  })
  fireEvent.click(screen.getByTestId('exploit-guide-btn'))
  unmount()
  await act(async () => {
    resolveGuide(new Response(JSON.stringify({ guide: '## RESUMEN\nguía tardía' }), { status: 200 }))
  })
  expect(onGuideReady).not.toHaveBeenCalled()
})

test('dev (StrictMode, doble efecto): la guia bajo demanda sigue llegando', async () => {
  const guide = '## RESUMEN\nguía strict'
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ guide }), { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  const onGuideReady = vi.fn()
  render(
    <StrictMode>
      <SummaryScreen
        analysis={base}
        selectedFindingIds={[]}
        onToggleFinding={() => {}}
        onSetAllFindings={() => {}}
        onGenerateScope={() => {}}
        onNewAudit={() => {}}
        onBack={() => {}}
        projectName="P"
        canGenerateGuide
        projectId="miniapp"
        onGuideReady={onGuideReady}
      />
    </StrictMode>,
  )
  fireEvent.click(screen.getByTestId('exploit-guide-btn'))
  await act(async () => {})
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(onGuideReady).toHaveBeenCalledWith('A01-1', guide)
})
