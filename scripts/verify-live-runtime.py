"""Opt-in actual Codex/Hub/API checks with a new, nonsensitive QA project."""

import json
import time
from pathlib import Path
from uuid import uuid4

import httpx


def main() -> None:
    root = "http://127.0.0.1:18731"
    evidence: dict = {"provider": "codex_login", "checks": [], "runs": []}
    with httpx.Client(base_url=root, timeout=60) as client:
        response = client.post(
            "/api/auth/register",
            json={
                "username": "live_" + uuid4().hex[:8],
                "password": uuid4().hex,
            },
        )
        response.raise_for_status()
        client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
        project = client.post(
            "/api/projects",
            json={
                "name": "실제 스킬 실행 검증",
                "goal": "공개용 합성 입력으로 작성·국소 수정·검수·요건화를 확인한다.",
            },
        ).json()
        project_id = project["id"]
        evidence["project_id"] = project_id

        def create(
            kind: str, title: str, body: str, data: dict | None = None
        ) -> dict:
            response = client.post(
                f"/api/projects/{project_id}/items",
                json={
                    "kind": kind,
                    "title": title,
                    "body": body,
                    "data": data or {},
                },
            )
            response.raise_for_status()
            return response.json()

        def execute(
            operation: str,
            instruction: str,
            target: dict | None,
            skills: list[str],
        ) -> dict:
            response = client.post(
                f"/api/projects/{project_id}/runs",
                json={
                    "operation": operation,
                    "instruction": instruction,
                    "target_id": target["id"] if target else None,
                    "skill_ids": skills,
                    "source_ids": [],
                    "reference_manifest": {},
                },
            )
            response.raise_for_status()
            run_id = response.json()["id"]
            deadline = time.monotonic() + 330
            while time.monotonic() < deadline:
                run = client.get(f"/api/runs/{run_id}").json()
                if run["status"] not in ("queued", "running"):
                    if run["status"] != "review_ready":
                        raise RuntimeError(
                            f"{operation}: {run['status']}; {run.get('error')}"
                        )
                    evidence["runs"].append(
                        {
                            "id": run_id,
                            "operation": operation,
                            "status": run["status"],
                            "skills": [
                                {
                                    "id": x["id"],
                                    "source_revision": x["source_revision"],
                                    "cache_key": x["cache_key"],
                                }
                                for x in run["skills_lock"]
                            ],
                        }
                    )
                    return run
                time.sleep(1)
            raise RuntimeError(f"{operation}: live check observation timeout")

        write = execute(
            "write_document",
            "한국어 Markdown으로 개인 할 일 앱의 기능 기획 초안을 10줄 이내로 작성하세요. 실제 구현이나 테스트 성공을 주장하지 마세요. requirements는 빈 배열로 두세요.",
            None,
            ["document-writing-workflow", "sentence-writing"],
        )
        assert write["result"]["document"]
        response = client.post(
            f"/api/runs/{write['id']}/apply",
            json={"selected_indices": [], "apply_document": True},
        )
        response.raise_for_status()
        evidence["checks"].append(
            "Hub 원문·현재 Codex 로그인으로 문서 신규 작성·명시 적용"
        )

        original = "# 검증 문서\n\n## 유지 구간\n원문 보존 기준입니다.\n\n## 변경 구간\n수정 전 설명\n"
        document = create("artifact", "국소 수정 검증", original)
        revised = execute(
            "revise_document",
            "대상 문서에서 '수정 전 설명'을 '수정 후 설명'으로만 바꾸세요. 다른 모든 문자·공백·줄바꿈·제목은 그대로 보존하세요. document에는 전체 수정 결과를, review에는 수행 범위와 한계를 쓰세요. requirements는 빈 배열로 두세요.",
            document,
            ["document-writing-workflow", "sentence-writing"],
        )
        assert (
            revised["result"]["document"].strip()
            == original.replace("수정 전 설명", "수정 후 설명").strip()
        )
        assert (
            client.get(f"/api/items/{document['id']}").json()["body"]
            == original
        )
        client.post(
            f"/api/runs/{revised['id']}/apply",
            json={"selected_indices": [], "apply_document": True},
        ).raise_for_status()
        document = client.get(f"/api/items/{document['id']}").json()
        evidence["checks"].append(
            "실제 LLM 국소 수정·비대상 본문 보존·적용 전 원문 불변"
        )

        reviewed = execute(
            "review_document",
            "이 Markdown 문서의 원문 보존과 절 구성만 검수하세요. 문서를 변경하지 말고 document=null, requirements=[]로 반환하세요. 실행하지 않은 검사와 도구 한계를 review에 밝혀 주세요.",
            document,
            ["document-review"],
        )
        assert reviewed["result"]["review"].strip()
        client.post(
            f"/api/runs/{reviewed['id']}/apply",
            json={"selected_indices": [], "apply_document": False},
        ).raise_for_status()
        assert client.get(f"/api/items/{document['id']}").json() == document
        evidence["checks"].append(
            "실제 LLM 문서 검수·검수 기록 저장·본문 불변"
        )

        feature = create(
            "feature",
            "할 일 완료 처리",
            "현재 할 일을 완료로 표시할 수 있다.",
            {"current_behavior": "전체 할 일을 한 건씩 완료 처리"},
        )
        idea = create(
            "idea",
            "여러 할 일 선택 완료",
            "기존 완료 기능에서 여러 항목을 선택해 한 번에 완료하고 싶다.",
        )
        analyzed = execute(
            "analyze_idea",
            "원안을 기존 기능의 확장으로 요건화하세요. 정확히 요건 후보 1개와 구현 작업 1개, 기존 단일 완료 동작의 회귀 테스트 1개를 제안하세요. 실제 제공된 기존 기능 ID를 feature_ids에 쓰세요. document=null이며 구현·테스트 성공을 주장하지 마세요.",
            idea,
            ["requirements-authoring", "requirements-verification"],
        )
        candidate = analyzed["result"]["requirements"][0]
        assert candidate["feature_ids"] == [feature["id"]]
        assert candidate["tasks"] and candidate["tests"]
        client.post(
            f"/api/runs/{analyzed['id']}/apply",
            json={"selected_indices": [0], "apply_document": False},
        ).raise_for_status()
        items = client.get(f"/api/projects/{project_id}/items").json()
        assert {"requirement", "task", "test_case"} <= {
            x["kind"] for x in items
        }
        evidence["checks"].append(
            "실제 아이디어 요건화·기존 기능 대조·작업·회귀 케이스 선택 생성"
        )
    directory = Path("docs/implementation/screenshots")
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "live-runtime-checks.json").write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(evidence, ensure_ascii=False))


if __name__ == "__main__":
    main()
