# Samples — proyectos de ejemplo

Proyectos sobre los que el motor de análisis (Fase 2a) hace su test de regresión.

## miniapp (incluida en el repo)

API Express pequeña, sin dependencias nativas, con **10 vulnerabilidades sembradas,
una por categoría** OWASP Top 10 (A01–A10). El ground truth está en
`samples/miniapp/expected-findings.json` (1 entrada por categoría, `file` relativo).

Arranque:

```
cd samples/miniapp
npm install
npm start
```

Escucha en `http://localhost:3000` (o `PORT` en el entorno).

## dvwa (se clona; gitignored)

DVWA (Damn Vulnerable Web Application) de digininja. Desde el root del repo:

```
git clone --depth 1 https://github.com/digininja/DVWA samples/dvwa
```

DVWA no necesita arrancar para el análisis: el scope del escáner son solo
`vulnerabilities/` e `include/`. La carpeta `samples/dvwa/` está gitignored;
si no existe, `GET /api/projects` muestra solo miniapp (sin error).
