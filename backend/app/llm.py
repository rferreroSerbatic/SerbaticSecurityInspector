"""Cliente LLM para un endpoint OpenAI-compatible (POST {base_url}/chat/completions)."""

from __future__ import annotations

import json
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
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        t0 = time.monotonic()
        content_parts: list[str] = []
        usage: dict = {}
        done = False
        try:
            async with self._client.stream("POST", "/chat/completions", json=payload) as response:
                if not response.is_success:
                    body = (await response.aread()).decode(errors="replace")[:200]
                    raise LLMError(f"el LLM respondió con estado {response.status_code}: {body}")
                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        done = True
                        break
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError as exc:
                        raise LLMError(f"chunk SSE malformado: {exc}") from exc
                    if chunk.get("usage"):
                        usage = chunk["usage"]
                    for choice in chunk.get("choices") or []:
                        piece = (choice.get("delta") or {}).get("content")
                        if isinstance(piece, str) and piece:
                            content_parts.append(piece)
        except httpx.HTTPError as exc:
            raise LLMError(f"error de red hablando con el LLM: {exc}") from exc
        except LLMError:
            raise
        if not done:
            raise LLMError("stream SSE truncado (no llegó [DONE])")
        if not content_parts:
            raise LLMError("el LLM no devolvió contenido")
        return ChatResult(
            content="".join(content_parts),
            prompt_tokens=int(usage.get("prompt_tokens") or 0),
            completion_tokens=int(usage.get("completion_tokens") or 0),
            elapsed_s=time.monotonic() - t0,
        )

    async def close(self) -> None:
        await self._client.aclose()
