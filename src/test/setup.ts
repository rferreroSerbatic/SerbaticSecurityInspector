import '@testing-library/jest-dom/vitest'

// React 18: marca el entorno de tests para que act() funcione sin warnings
// (necesario por los handlers async de fetch en SourceScreen, Fase 2b).
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
