import json

import httpx
import pytest

from app.llm import LLMClient, LLMError


def sse_body(chunks):
    out = b"".join(b"data: " + json.dumps(c).encode() + b"\n\n" for c in chunks)
    return out + b"data: [DONE]\n\n"


@pytest.mark.anyio
async def test_chat_sends_correct_body():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.read())
        return httpx.Response(
            200,
            content=sse_body([
                {"choices": [{"delta": {"content": "ho"}}],
                 "usage": {"prompt_tokens": 12, "completion_tokens": 5}},
            ]),
            headers={"content-type": "text/event-stream"},
        )

    c = LLMClient("http://test/v1", "TESTKEY", "qwen3.8-fp8", transport=httpx.MockTransport(handler))
    out = await c.chat("sistema", "usuario")
    await c.close()
    assert out.content == "ho"
    assert (out.prompt_tokens, out.completion_tokens) == (12, 5)
    assert out.elapsed_s >= 0
    assert seen["path"] == "/v1/chat/completions"
    assert seen["auth"] == "Bearer TESTKEY"
    assert seen["body"]["model"] == "qwen3.8-fp8"
    assert seen["body"]["temperature"] == 0
    assert seen["body"]["max_tokens"] == 8000
    assert seen["body"]["chat_template_kwargs"] == {"enable_thinking": False}
    assert seen["body"]["stream"] is True
    assert seen["body"]["stream_options"] == {"include_usage": True}


@pytest.mark.anyio
async def test_chat_error_raises():
    c = LLMClient("http://test/v1", "TESTKEY", "qwen3.8-fp8",
                  transport=httpx.MockTransport(lambda r: httpx.Response(500, text="boom")))
    with pytest.raises(LLMError):
        await c.chat("s", "u")
    await c.close()


@pytest.mark.anyio
async def test_chat_without_usage_defaults_zero():
    """Endpoints sin `usage` en la respuesta: los counters quedan a 0 (no romper el run)."""
    c = LLMClient("http://test/v1", "TESTKEY", "qwen3.8-fp8",
                  transport=httpx.MockTransport(
                      lambda r: httpx.Response(200, content=sse_body([{"choices": [{"delta": {"content": "x"}}]}]),
                                               headers={"content-type": "text/event-stream"})))
    out = await c.chat("s", "u")
    await c.close()
    assert out.content == "x"
    assert (out.prompt_tokens, out.completion_tokens, out.tps) == (0, 0, 0.0)
