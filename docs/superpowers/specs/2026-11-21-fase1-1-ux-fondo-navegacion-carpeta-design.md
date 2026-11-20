# Fase 1.1 — UX: fondo a ancho completo, volver/migas de pan y carpeta real (design)

Fecha: 2026-11-21. Cambio pequeño post-Fase 1, aprobado en conversación por el usuario («adelante»).

## Intención

El usuario probó la app en navegador y vio tres cosas: (1) el fondo (glows) se ve solo dentro del «recuadro» de la app (`max-w-5xl`), no a todo el ancho de pantalla, y los botones del pie (NUEVA AUDITORÍA, GENERAR ALCANCE) parecen pegados al borde de ese recuadro; (2) no hay forma de volver entre fases (no hay migas de pan navegables ni botón Volver en Progreso/Resumen); (3) la pestaña «Carpeta local» solo ofrece 3 proyectos mock — quiere poder elegir una carpeta real de su equipo desde el front.

## Objetivos

- Fondo ambiental (glows cian/magenta) a **ancho completo de la viewport** en todas las pantallas.
- **Navegación hacia atrás** entre fases: migas de pan clicables (pasos completados) + botón `← Volver` en las pantallas que no lo tienen (Progreso, Resumen).
- **Selector de carpeta real** (navegador) como tercera opción en la pestaña «Carpeta local», además de los 3 proyectos demo (que se conservan).

## No objetivos (anti-goals)

- Análisis real de la carpeta: el análisis sigue siendo mock (Fase 1). La carpeta elegida solo aporta nombre + nº de archivos como «fuente».
- Proyectos demo reales (p. ej. un form vulnerable sencillo que se pueda probar de verdad): tema aparte, pendiente de conversación con el usuario. Queda anotado en PROGRESS.md.
- Cambios de estética más allá de lo pedido (tipografías, colores, layout del contenido).
- Persistencia de la selección de carpeta (Fase 1 = estado en memoria).

## Restricciones

- Stack invariable: Vite 5 + React 18 + TS strict + Tailwind 3.4 + Vitest/RTL/jsdom. Sin dependencias nuevas.
- «Sin llamadas de red» de Fase 1 se respeta: `input[webkitdirectory]` es acceso local iniciado por el usuario, no red.
- Todo copy en español. Paleta y tokens existentes.
- `npm run build` (tsc --noEmit) limpio y suite completa verde en cada task.

## Enfoques considerados

1. **Fondo: capa ambiental fija en AppShell** (elegido). Un `<div aria-hidden className="fixed inset-0 pointer-events-none">` con los radial-gradients, una única vez en la shell, detrás de todo el contenido. Los glows por pantalla desaparecen. Pro: fondo coherente en todas las pantallas, un solo lugar de estilos, soluciona el «recuadro» y el «botones pegados al borde». Con: hay que borrar 4 capas duplicadas (home/source/progress/summary) — trivial.
2. Fondo por pantalla pero `position: fixed` en cada sección: mismo resultado visual, 4 veces más código y riesgo de doble glow al hacer transiciones. Descartado.
3. Ampliar `max-w-5xl` para «engañar»: no arregla el problema en pantallas anchas ni el principio (el contenido centrado no es el problema; el fondo sí). Descartado.

Navegación:

1. **Migas de pan = StepIndicator con pasos completados clicables + `← Volver` en Progreso/Resumen** (elegido). Reutiliza el indicador existente (ya es la «miga»), mínima superficie nueva: `goVulns()` en `useAnalysis` (y `goSource` cancela si hay análisis en curso). Pro: coherente con el diseño aprobado, accesible (botones reales), barato. Con: hay que testear el cancel al volver desde Progreso.
2. Solo botones `← Volver` en cada pantalla, migas sin clic: cumple la mitad de la petición del usuario («migas de pan»). Descartado.
3. Navegación libre a cualquier paso (incl. pasos futuros): romperia la semántica del flujo (ir a INFORME sin análisis). Descartado.

Carpeta:

1. **`<input type="file" webkitdirectory>`** oculto detrás de un botón «📂 Seleccionar carpeta…» (elegido). Estándar de facto en Chrome/Edge/Firefox, sin librerías, sin red. Al elegir: nombre de carpeta (de `webkitRelativePath` del primer archivo) + nº de archivos; `Source = { kind: 'folder', label: nombre, value: nombre }`; muestra confirmación `Carpeta seleccionada: nombre (N archivos)` y habilita CONTINUAR.
2. File System Access API (`showDirectoryPicker`): drag&drop y API más moderna, pero solo Chromium, más código, y no aporta nada a la demo (no leemos el contenido). Descartado para Fase 1.
3. Input de texto para pegar la ruta: no da información real (nº de archivos) y finge algo que no pasa. Descartado.

## Decisiones del builder (las hago yo, avisadas)

- Volver desde Progreso cancela el análisis en curso (el usuario abandonó la fase).
- Volver desde Resumen lleva a Vulnerabilidades (conserva el análisis hecho; re-ejecutar lo reemplaza).
- El paso `1 FUENTE` clicable lleva a Fuente; si ya había fuente elegida, el usuario puede cambiarla (la pantalla arranca limpia; es lo que haría un wizard).
- Los 3 proyectos demo se conservan como opción «proyecto demo» (a decidir en otra conversación cómo evolucionan).
- En `webkitdirectory` el TS no conoce el atributo: ampliación de tipo local en el archivo de SourceScreen (`declare global`), sin `any`.

## Para el builder

- Mantener los tests existentes verdes (el E2E de `App.test.tsx` usa `getByRole` — los pasos de StepIndicator pasan de `<span>` a `<button>` solo cuando están completados; verificar que ninguna query se rompe).
- Tests TDD por pantalla (StepIndicator clicables, goVulns/cancel, SourceScreen carpeta con input simulado).
- Copy exactos: `← Volver` (mismo estilo que SourceScreen/VulnSelectScreen), `Seleccionar carpeta…`, `Carpeta seleccionada: …`.
