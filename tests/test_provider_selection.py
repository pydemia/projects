import json

import httpx
from starlette.datastructures import State

from projects.config import Settings
from projects.jobs import configured_runner
from projects.runtime import OpenAICompatibleRunner


def test_yaml_openai_selection_reaches_http_request(monkeypatch, tmp_path):
    config = tmp_path / "server.yaml"
    config.write_text(
        "llm:\n  provider: openai_compatible\n"
        "  base_url: https://provider.example/v1\n"
        "  model: configured-model\n  api_key: synthetic-only\n",
    )
    monkeypatch.setenv("PROJECTS_CONFIG", str(config))
    for key in ("PROVIDER", "BASE_URL", "MODEL", "API_KEY"):
        monkeypatch.delenv("PROJECTS_LLM_" + key, raising=False)
    settings = Settings.from_env()
    observed = {}

    def respond(request):
        observed["url"] = str(request.url)
        observed["body"] = json.loads(request.content)
        observed["authenticated"] = (
            request.headers["Authorization"] == "Bearer synthetic-only"
        )
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "content": json.dumps(
                                {
                                    "document": "# 형식 확인",
                                    "review": "모의 HTTP 응답",
                                    "requirements": [],
                                    "assumptions": [],
                                    "questions": [],
                                    "source_ids": [],
                                }
                            )
                        },
                    }
                ]
            },
        )

    def runner_factory(*args, **kwargs):
        return OpenAICompatibleRunner(
            *args, transport=httpx.MockTransport(respond), **kwargs
        )

    monkeypatch.setattr("projects.jobs.OpenAICompatibleRunner", runner_factory)
    state = State({"settings": settings, "runner": None})
    runner = configured_runner(state)
    assert (
        runner.run([{"role": "user", "content": "형식 확인"}]).document
        == "# 형식 확인"
    )
    assert configured_runner(state) is runner
    assert observed["url"] == "https://provider.example/v1/chat/completions"
    assert observed["body"]["model"] == "configured-model"
    assert observed["authenticated"] is True
    assert "synthetic-only" not in repr(settings)
