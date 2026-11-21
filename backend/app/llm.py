"""Cliente LLM para un endpoint OpenAI-compatible (POST {base_url}/chat/completions)."""

from __future__ import annotations

import httpx


class LLMError(Exception):
    """Fallo al llamar al LLM (error de red, respuesta no-2xx o respuesta malformada)."""


class LLMClient:
    """Cliente asíncrono mínimo para chat con un endpoint OpenAI-compatible.

    El parámetro ``transport`` es solo para tests (p. ej. ``httpx.MockTransport``).
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        timeout: float = 180.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._model = model
        self._client = httpx.AsyncClient(
            base_url=base_url,
            timeout=timeout,
            transport=transport,
            headers={"Authorization": f"Bearer {api_key}"},
        )

    async def chat(self, system: str, user: str, max_tokens: int = 8000) -> str:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0,
            "max_tokens": max_tokens,
            "chat_template_kwargs": {"enable_thinking": False},
        }
        try:
            response = await self._client.post("/chat/completions", json=payload)
        except httpx.HTTPError as exc:
            raise LLMError(f"error de red hablando con el LLM: {exc}") from exc
        if not response.is_success:
            raise LLMError(f"el LLM respondió con estado {response.status_code}: {response.text[:200]}")
        try:
            data = response.json()
            content = data["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise LLMError(f"respuesta del LLM malformada: {exc}") from exc
        if not isinstance(content, str):
            raise LLMError("el LLM devolvió un 'content' no textual")
        return content

    async def close(self) -> None:
        await self._client.aclose()
