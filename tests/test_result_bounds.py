import pytest
from pydantic import ValidationError

from projects.runtime import RunResult


@pytest.mark.parametrize(
    "field,value",
    [
        ("title", "제" * 301),
        ("acceptance_criteria", ["조건"] * 101),
    ],
)
def test_generated_candidates_fit_persistence(field, value):
    candidate = {
        "title": "요구",
        "body": "",
        "acceptance_criteria": [],
        "feature_ids": [],
        "disposition": "new",
        "rationale": "",
        "design_changes": [],
        "tasks": [],
        "tests": [],
    }
    candidate[field] = value
    with pytest.raises(ValidationError):
        RunResult.model_validate(
            {
                "document": None,
                "review": "",
                "requirements": [candidate],
                "assumptions": [],
                "questions": [],
                "source_ids": [],
            }
        )
