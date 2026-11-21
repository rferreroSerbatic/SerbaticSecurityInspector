import json

import httpx
import pytest

from app.llm import LLMClient, LLMError


@pytest.mark.anyio
async def test_chat_sends_correct_body():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.read())
        return httpx.Response(200, json={"choices": [{"message": {"content": "hola"}}]})

    c = LLMClient("http://test/v1", "TESTKEY", "qwen3.8-fp8", transport=httpx.MockTransport(handler))
    out = await c.chat("sistema", "usuario")
    await c.close()
    assert out == "hola"
    assert seen["path"] == "/v1/chat/completions"
    assert seen["auth"] == "Bearer TESTKEY"
    assert seen["body"]["model"] == "qwen3.8-fp8"
    assert seen["body"]["temperature"] == 0
    assert seen["body"]["max_tokens"] == 8000
    assert seen["body"]["chat_template_kwargs"] == {"enable_thinking": False}


@pytest.mark.anyio
async def test_chat_error_raises():
    c = LLMClient("http://test/v1", "TESTKEY", "qwen3.8-fp8",
                  transport=httpx.MockTransport(lambda r: httpx.Response(500, text="boom")))
    with pytest.raises(LLMError):
        await c.chat("s", "u")
    await c.close()
