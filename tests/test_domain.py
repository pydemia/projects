import pytest

from projects.domain import Problem, check_dependency_cycle, validate_item_data


def test_task_state_and_unknown_fields_are_rejected():
    assert validate_item_data("task", {})["state"] == "todo"
    with pytest.raises(Problem):
        validate_item_data("task", {"state": "passed"})
    with pytest.raises(Problem):
        validate_item_data("task", {"acceptance_criteria": [], "secret": 1})


def test_cycle_rejects_transitive_and_self_dependency():
    check_dependency_cycle("a", "b", [("b", "c")])
    with pytest.raises(Problem):
        check_dependency_cycle("a", "a", [])
    with pytest.raises(Problem):
        check_dependency_cycle("c", "a", [("a", "b"), ("b", "c")])


def test_conflict_is_not_a_new_requirement_by_default():
    data = validate_item_data("requirement", {"disposition": "conflict"})
    assert data["disposition"] == "conflict"
