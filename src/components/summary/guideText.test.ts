import { expect, test } from 'vitest'
import { parseGuideLines } from './guideText'

test('heading, texto y código', () => {
  expect(parseGuideLines('## RESUMEN\nexplicación\n\n## PAYLOAD DE EJEMPLO\n```\nuser=1 OR 1=1--\nSELECT *\n```\n## IMPACTO\nfin')).toEqual([
    { kind: 'heading', text: 'RESUMEN' },
    { kind: 'text', text: 'explicación' },
    { kind: 'heading', text: 'PAYLOAD DE EJEMPLO' },
    { kind: 'code', text: 'user=1 OR 1=1--\nSELECT *' },
    { kind: 'heading', text: 'IMPACTO' },
    { kind: 'text', text: 'fin' },
  ])
})

test('vacio y fence sin cerrar', () => {
  expect(parseGuideLines('')).toEqual([])
  expect(parseGuideLines('```\na\nb')).toEqual([{ kind: 'code', text: 'a\nb' }])
})
