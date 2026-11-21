import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    onGenerateScope?: () => void
    onNewAudit?: () => void
    onBack?: () => void
  } = {},
  demoBaseUrl?: string,
) =>
  render(
    <SummaryScreen
      analysis={analysis}
      selectedFindingIds={selectedFindingIds}
      onToggleFinding={handlers.onToggleFinding ?? (() => {})}
      onGenerateScope={handlers.onGenerateScope ?? (() => {})}
      onNewAudit={handlers.onNewAudit ?? (() => {})}
      onBack={handlers.onBack ?? (() => {})}
      demoBaseUrl={demoBaseUrl}
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
