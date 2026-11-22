# DEMO - Injection / SQL Injection (A03:2021)

El handler `/api/users` construye la consulta SQL concatenando la entrada del
usuario (`req.query.user`) sin parametrizar ni escapar.

## Cómo explotarla
1. Pide `GET /api/users?user=' OR '1'='1`.
2. La query resultante (`... WHERE user = '' OR '1'='1'`) siempre es verdadera:
   devuelve la tabla completa sin credenciales.
3. Variante: `?user=maria' --` comenta el resto de la query.

## Test para el scanner
- La concatenación está en `app.js` (línea `var sql =`).
- El análisis (agente A03) debe reportar inyección SQL en `app.js`.

## Ejecución
Proyecto de ejemplo para auditar (no se ejecuta: `db` es un stub).
