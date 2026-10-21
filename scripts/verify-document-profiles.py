"""Opt-in actual Hub/Codex checks for all seven core Markdown profiles."""

import hashlib
import io
import json
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4
from zipfile import ZipFile

import httpx


def main() -> None:
    destination = Path(
        "docs/implementation/screenshots/core-document-checks.json"
    )
    evidence: dict = {
        "provider": "codex_login",
        "input": "synthetic personal task app; original starter field content",
        "checks": [],
    }
    with httpx.Client(base_url="http://127.0.0.1:18731", timeout=60) as client:
        response = client.post(
            "/api/auth/register",
            json={
                "username": "profiles_" + uuid4().hex[:8],
                "password": uuid4().hex,
            },
        )
        response.raise_for_status()
        client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
        response = client.post(
            "/api/projects",
            json={
                "name": "필수 7종 실제 작성 검증",
                "goal": "개인 할 일 앱의 문서 초안",
            },
        )
        response.raise_for_status()
        project_id = response.json()["id"]
        evidence["project_id"] = project_id
        catalog = client.get("/api/catalog").json()
        artifacts = {row["id"]: row for row in catalog["artifacts"]}

        for profile in catalog["document_profiles"]:
            artifact = artifacts[profile["artifact_id"]]
            template_ref = next(iter(artifact["public_reference_ids"]), None)
            starter = "# 자체 시작 양식\n\n" + "\n".join(
                "## " + field + "\n프로젝트에 맞게 작성합니다.\n"
                for field in artifact["starter_fields"]
            )
            response = client.post(
                f"/api/projects/{project_id}/items",
                json={
                    "kind": "artifact",
                    "title": profile["name"] + "의 자체 시작 양식",
                    "body": starter,
                    "data": {"artifact_type": profile["id"]},
                },
            )
            response.raise_for_status()
            source_id = response.json()["id"]
            response = client.post(
                f"/api/projects/{project_id}/runs",
                json={
                    "operation": "write_document",
                    "instruction": (
                        f"개인 할 일 앱의 {profile['name']} Markdown 초안을 작성하세요. "
                        "핵심 기능은 할 일 추가·단일 완료·다중 선택 완료이며 PostgreSQL을 사용합니다. "
                        "제공된 자체 시작 양식의 필드 중 이 문서에 필요한 항목을 사용하세요. "
                        "실제 구현·테스트 성공과 제공되지 않은 수치·화면·도구 실행을 주장하지 마세요. "
                        "텍스트 범위에서 필요한 내용을 작성하고 문서 외 가정·도구 한계·미검증은 "
                        "assumptions/questions/review에 분리하세요. requirements는 빈 배열로 두세요. "
                        "문서 본문은 검토 가능한 초안으로 35줄 이내로 작성하세요."
                    ),
                    "skill_ids": [profile["suggested_primary_skill"]],
                    "source_ids": [source_id],
                    "reference_manifest": {
                        "artifact_type": profile["id"],
                        "template_ref": template_ref,
                        "project_source_refs": [source_id],
                    },
                },
            )
            response.raise_for_status()
            run_id = response.json()["id"]
            deadline = time.monotonic() + 330
            while time.monotonic() < deadline:
                response = client.get(f"/api/runs/{run_id}")
                response.raise_for_status()
                run = response.json()
                if run["status"] not in ("queued", "running"):
                    break
                time.sleep(1)
            assert run["status"] == "review_ready", (
                profile["id"],
                run["status"],
                run.get("error"),
            )
            body = run["result"]["document"]
            assert body and body.strip()
            manifest = run["reference_manifest"]
            assert manifest["document_profile"]["id"] == profile["id"]
            assert manifest["selected_template"]["read_in_this_run"] is False
            assert any(
                row["id"] == source_id and row["body"] == starter
                for row in run["source_snapshots"]
            )
            response = client.post(
                f"/api/runs/{run_id}/apply",
                json={"selected_indices": [], "apply_document": True},
            )
            response.raise_for_status()
            items = client.get(f"/api/projects/{project_id}/items").json()
            document = next(row for row in items if row["body"] == body)
            assert document["data"]["artifact_type"] == profile["id"]
            response = client.get(f"/api/items/{document['id']}/portable")
            response.raise_for_status()
            standalone = Path(".projects/qa-standalone-document.zip")
            standalone.parent.mkdir(parents=True, exist_ok=True)
            standalone.write_bytes(response.content)
            with ZipFile(io.BytesIO(response.content)) as archive:
                assert archive.read("document.md").decode() == body
                assert json.loads(archive.read("references.json")) == manifest
                lock = json.loads(archive.read("skills.lock.json"))
                assert lock["bundles"] == run["skills_lock"]
            evidence["checks"].append(
                {
                    "profile": profile["id"],
                    "run_id": run_id,
                    "document_id": document["id"],
                    "body_sha256": hashlib.sha256(body.encode()).hexdigest(),
                    "skills": [
                        {
                            "id": row["id"],
                            "revision": row["source_revision"],
                            "cache_key": row["cache_key"],
                        }
                        for row in run["skills_lock"]
                    ],
                    "read_project_starter": True,
                    "public_template": "metadata only, not fetched by this run",
                    "review": run["result"]["review"],
                    "assumptions": run["result"]["assumptions"],
                    "questions": run["result"]["questions"],
                    "result": "actual draft → explicit apply → portable body/lock/manifest equality",
                }
            )
            evidence["checked_at"] = datetime.now(UTC).isoformat()
            destination.write_text(
                json.dumps(evidence, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            print(
                profile["id"] + ": actual generation/apply/portable passed",
                flush=True,
            )


if __name__ == "__main__":
    main()
