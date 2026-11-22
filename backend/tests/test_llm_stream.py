"""Streaming SSE del LLMClient: chunks, usage, rarezas (T3 Fase 2b)."""
import json
import time

import httpx
import pytest

from app.llm import LLMClient, LLMError


def sse_body(chunks):
    out = b"".join(b"data: " + json.dumps(c).encode() + b"\n\n" for c in chunks)
    return out + b"data: [DONE]\n\n"


def client_with(chunks, status=200):
    def handler(request: httpx.Request) -> httpx.Response:
        # El stream in-memory dura microsegundos: con el tick de ~15,6 ms de
        # time.monotonic() en Windows, elapsed_s saldría 0.0 y el test sería
        # flaky. Un retardo corto hace la medición determinista.
        time.sleep(0.03)
        return httpx.Response(status, content=sse_body(chunks),
                              headers={"content-type": "text/event-stream"})
    return LLMClient("http://test/v1", "TESTKEY", "qwen3.8-fp8",
                     transport=httpx.MockTransport(handler))


@pytest.mark.anyio
async def test_stream_multi_chunk_with_usage():
    c = client_with([
        {"choices": [{"delta": {"content": "ho"}}]},
        {"choices": [{"delta": {"content": "la"}}]},
        {"choices": [], "usage": {"prompt_tokens": 12, "completion_tokens": 5}},
    ])
    out = await c.chat("s", "u")
    await c.close()
    assert out.content == "hola"
    assert (out.prompt_tokens, out.completion_tokens) == (12, 5)
    assert out.elapsed_s > 0 and out.tps > 0


@pytest.mark.anyio
async def test_stream_without_usage_defaults_zero():
    c = client_with([{"choices": [{"delta": {"content": "x"}}]}])
    out = await c.chat("s", "u")
    await c.close()
    assert out.content == "x"
    assert (out.prompt_tokens, out.completion_tokens, out.tps) == (0, 0, 0.0)


@pytest.mark.anyio
async def test_stream_ignores_finish_reason_and_empty_delta():
    c = client_with([
        {"choices": [{"delta": {"content": "a"}, "finish_reason": None}]},
        {"choices": [{"delta": {}, "finish_reason": "stop"}]},  # Review Focus 4
    ])
    out = await c.chat("s", "u")
    await c.close()
    assert out.content == "a"


@pytest.mark.anyio
async def test_stream_malformed_chunk_raises():
    def handler(request):
        return httpx.Response(200, content=b"data: {no json}\n\n",
                              headers={"content-type": "text/event-stream"})
    c = LLMClient("http://test/v1", "TESTKEY", "m", transport=httpx.MockTransport(handler))
    with pytest.raises(LLMError, match="malformado"):
        await c.chat("s", "u")
    await c.close()


@pytest.mark.anyio
async def test_stream_non_dict_chunk_raises():
    """Chunk SSE válido JSON pero no objeto (null/123/«s») → LLMError, no AttributeError."""
    def handler(request):
        return httpx.Response(200, content=b"data: null\n\n",
                              headers={"content-type": "text/event-stream"})
    c = LLMClient("http://test/v1", "TESTKEY", "m", transport=httpx.MockTransport(handler))
    with pytest.raises(LLMError, match="no es un objeto"):
        await c.chat("s", "u")
    await c.close()


@pytest.mark.anyio
async def test_stream_truncated_without_done_raises():
    body = b"data: " + json.dumps({"choices": [{"delta": {"content": "a"}}]}).encode() + b"\n\n"
    c = LLMClient("http://test/v1", "TESTKEY", "m",
                  transport=httpx.MockTransport(lambda r: httpx.Response(200, content=body)))
    with pytest.raises(LLMError, match="truncado"):
        await c.chat("s", "u")
    await c.close()


@pytest.mark.anyio
async def test_stream_empty_content_raises():
    c = client_with([{"choices": [], "usage": {"prompt_tokens": 1, "completion_tokens": 0}}])
    with pytest.raises(LLMError, match="contenido"):
        await c.chat("s", "u")
    await c.close()


@pytest.mark.anyio
async def test_chat_on_progress_reporta_en_vivo():
    """QA-iter 5: ``on_progress`` recibe la estimación en vuelo (elapsed,
    caracteres acumulados / 4) en cada chunk con contenido."""
    calls: list[tuple[float, int]] = []
    c = client_with([
        {"choices": [{"delta": {"content": "hola" * 10}}]},
        {"choices": [{"delta": {"content": "mundo" * 10}}]},
        {"choices": [], "usage": {"prompt_tokens": 12, "completion_tokens": 100}},
    ])
    out = await c.chat("s", "u", on_progress=lambda e, t: calls.append((e, t)))
    await c.close()
    assert out.content == "hola" * 10 + "mundo" * 10
    assert len(calls) == 2  # el chunk de usage no dispara la callback
    assert all(e > 0 for e, _ in calls)
    assert calls[0][1] == 10  # 40 caracteres / 4
    assert calls[1][1] == 22  # acumulativo: (40 + 50) / 4
