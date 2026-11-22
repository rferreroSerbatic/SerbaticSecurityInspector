import type { Finding, Severity, Vuln } from '../../types'

// Genera el «alcance técnico de mejora» en texto plano (español), listo para
// copiar o imprimir. Función pura y determinista: mismas entradas, misma
// salida. La fecha llega como dateISO (sin new Date() dentro, para no
// introducir no-determinismo ni dependencias del huso horario).

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

// Mismos labels que SeverityBadge, para que el texto sea coherente con la UI.
const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'CRÍTICO',
  high: 'ALTO',
  medium: 'MEDIO',
  low: 'BAJO',
}

const SEVERITY_PLAN: Record<Severity, { hours: number; priority: string }> = {
  critical: { hours: 4, priority: 'inmediata' },
  high: { hours: 3, priority: 'alta' },
  medium: { hours: 2, priority: 'media' },
  low: { hours: 1, priority: 'baja' },
}

// 'YYYY-MM-DD' (o ISO completo) → 'DD/MM/AAAA'. Sin Date: basta con
// reordenar los componentes y así no interviene el huso horario.
function fechaEspanola(dateISO: string): string {
  const [year, month, day] = dateISO.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

export function buildScopeText(
  findings: Finding[],
  vulns: Vuln[],
  projectName: string,
  dateISO: string,
): string {
  const header = [
    'ALCANCE TÉCNICO DE MEJORA — SEGURIDAD',
    `Proyecto: ${projectName} · ${fechaEspanola(dateISO)} · Serbatic Security Inspector`,
  ]

  // Agrupamos por vulnerabilidad, omitiendo hallazgos cuya vulnId no está en
  // la lista (defensivo; con los datos de la Fase 1 es inalcanzable).
  const knownVulnIds = new Set(vulns.map((v) => v.id))
  const byVuln = new Map<string, Finding[]>()
  for (const f of findings) {
    if (!knownVulnIds.has(f.vulnId)) continue
    const group = byVuln.get(f.vulnId)
    if (group) group.push(f)
    else byVuln.set(f.vulnId, [f])
  }

  // Orden canónico A01..A10 (los ids llevan relleno fijo: basta sort por string).
  const vulnIds = [...byVuln.keys()].sort()

  if (vulnIds.length === 0) {
    return `${header.join('\n')}\nNo se incluyen hallazgos en este alcance.`
  }

  const blocks: string[] = []
  let n = 0
  for (const vulnId of vulnIds) {
    const vuln = vulns.find((v) => v.id === vulnId)
    if (!vuln) continue // redundante con el filtro anterior; defensividad

    // Dentro del grupo: por severidad (critical > high > medium > low).
    // Array.prototype.sort es estable: igual severidad conserva el orden de
    // entrada.
    const group = [...byVuln.get(vulnId)!].sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    )
    for (const f of group) {
      n += 1
      const { hours, priority } = SEVERITY_PLAN[f.severity]
      blocks.push(
        [
          // QA-iter 6: el CVE de la categoría va en texto plano (sin enlace) en el alcance.
          `${n}. ${f.title.toUpperCase()} (${vuln.name.toUpperCase()} · ${vuln.cve}) — ${SEVERITY_LABEL[f.severity]}`,
          `Objetivo: eliminar ${f.title} detectado en ${f.file}.`,
          `· Revisar la ocurrencia en ${f.file}:${f.line} y aplicar la solución recomendada.`,
          `· Validar el cambio con una prueba que cubra el caso de ${f.title}.`,
          `Estimación: ${hours} h · Prioridad: ${priority}`,
        ].join('\n'),
      )
    }
  }

  return `${header.join('\n')}\n\n${blocks.join('\n\n')}`
}
