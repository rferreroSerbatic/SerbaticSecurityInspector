"""Cliente LLM para un endpoint OpenAI-compatible (POST {base_url}/chat/completions)."""

from __future__ import annotations

import time
from dataclasses import dataclass

import httpx


class LLMError(Exception):
    """Fallo al llamar al LLM (error de red, respuesta no-2xx o respuesta malformada)."""


@dataclass
class ChatResult:
    """Respuesta del LLM con su uso de tokens (para mostrar velocidad en la UI)."""

    content: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    elapsed_s: float = 0.0

    @property
    def tps(self) -> float:
        """Tokens generados por segundo (0 si no hay uso ni tiempo medido)."""
        if self.elapsed_s <= 0 or self.completion_tokens <= 0:
            return 0.0
        return self.completion_tokens / self.elapsed_s


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

    @property
    def model(self) -> str:
        return self._model

    async def chat(self, system: str, user: str, max_tokens: int = 8000) -> ChatResult:
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
        t0 = time.monotonic()
        try:
            response = await self._client.post("/chat/completions", json=payload)
        except httpx.HTTPError as exc:
            raise LLMError(f"error de red hablando con el LLM: {exc}") from exc
        if not response.is_success:
            raise LLMError(f"el LLM respondió con estado {response.status_code}: {response.text[:200]}")
        try:
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            usage = data.get("usage") or {}
            result = ChatResult(
                content=content,
                prompt_tokens=int(usage.get("prompt_tokens") or 0),
                completion_tokens=int(usage.get("completion_tokens") or 0),
                elapsed_s=time.monotonic() - t0,
            )
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise LLMError(f"respuesta del LLM malformada: {exc}") from exc
        if not isinstance(result.content, str):
            raise LLMError("el LLM devolvió un 'content' no textual")
        return result

    async def close(self) -> None:
        await self._client.aclose()
