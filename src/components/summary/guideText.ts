// Módulo puro (mismo patrón que scope/scopeText.ts): parsea la guía de
// explotación (texto libre con `## ` headings y fenced code blocks) en
// bloques renderizables. Determinista: mismas entradas, misma salida.

export interface GuideBlock { kind: 'heading' | 'text' | 'code'; text: string }

/** Parsea la guía (texto libre con `## ` y fences) en bloques renderizables. */
export function parseGuideLines(guide: string): GuideBlock[] {
  const blocks: GuideBlock[] = []
  let codeLines: string[] | null = null

  for (const line of guide.split('\n')) {
    // Una línea que empieza por ``` alterna el modo código.
    if (line.startsWith('```')) {
      if (codeLines) {
        blocks.push({ kind: 'code', text: codeLines.join('\n') })
        codeLines = null
      } else {
        codeLines = []
      }
      continue
    }
    if (codeLines) {
      // Las líneas interiores se acumulan en un único bloque de código.
      codeLines.push(line)
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push({ kind: 'heading', text: line.slice(3) })
    } else if (line.trim() === '') {
      // Líneas vacías fuera de fence → ignoradas.
    } else {
      blocks.push({ kind: 'text', text: line })
    }
  }

  // Fence sin cerrar → el resto es código.
  if (codeLines) blocks.push({ kind: 'code', text: codeLines.join('\n') })
  return blocks
}
