"""Opt-in standalone Codex edit from a portable archive; no DB/API dependency."""

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from zipfile import ZipFile

from projects.codex_runner import CodexLoginRunner
from projects.config import Settings
from projects.runtime import RunRequest, build_messages


def main() -> None:
    source = Path(".projects/qa-standalone-document.zip")
    with ZipFile(source) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        for name, expected in manifest["files"].items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == expected
        body = archive.read("document.md").decode("utf-8")
        locks = json.loads(archive.read("skills.lock.json"))["bundles"]
        bundles = [
            json.loads(archive.read(f"bundles/{row['id']}.json"))
            for row in locks
        ]
        references = json.loads(archive.read("references.json"))
        sources = json.loads(archive.read("sources.json"))
    # Synthetic local-only marker gives an exact preservation assertion.
    target = body + "\n\n<!-- EXTERNAL-CHECK: BEFORE -->\n"
    messages = build_messages(
        RunRequest(
            operation="revise_document",
            instruction=(
                "대상 본문에서 HTML 주석의 'EXTERNAL-CHECK: BEFORE'를 "
                "'EXTERNAL-CHECK: AFTER'로만 바꾸세요. 다른 모든 문자와 공백·줄바꿈을 "
                "보존하고 document에 전체 결과를 반환하세요. requirements=[]이며 "
                "실행하지 않은 도구와 검사 한계는 review에 남기세요."
            ),
            target=target,
            sources=sources,
            reference_manifest=references,
        ),
        bundles,
    )
    runner = CodexLoginRunner(Settings.from_env())
    try:
        result = runner.run(messages)
    finally:
        runner.close()
    assert result.document is not None
    assert (
        result.document.strip()
        == target.replace(
            "EXTERNAL-CHECK: BEFORE", "EXTERNAL-CHECK: AFTER"
        ).strip()
    )
    evidence = {
        "checked_at": datetime.now(UTC).isoformat(),
        "mode": "standalone archive; no database, API or bundle download",
        "skills": locks,
        "profile": references["artifact_type"],
        "input_sha256": hashlib.sha256(target.encode()).hexdigest(),
        "output_sha256": hashlib.sha256(result.document.encode()).hexdigest(),
        "result": "actual current-login local edit; all other text preserved",
        "review": result.review,
    }
    Path(
        "docs/implementation/screenshots/standalone-runtime-checks.json"
    ).write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(evidence["result"])


if __name__ == "__main__":
    main()
