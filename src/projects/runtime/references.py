"""양식 구조와 과거 접근 관찰을 작성 규칙과 구분한다."""

import copy
import re
from pathlib import Path
from typing import Literal

from pydantic import Field, JsonValue, TypeAdapter, ValidationError

from ._inputs import parse_json, validate_http_url
from .models import RuntimeFailure, RuntimeModel

_REFERENCE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")
_JSON_OBJECT = TypeAdapter(dict[str, JsonValue])
_DERIVED_FIELDS = {
    "selected_template",
    "selected_examples",
    "artifact",
    "original_reference",
    "public_reference_status",
    "template_version_status",
    "catalog_artifact_id",
    "document_profile",
}
# The API's Application design name refers to the registry's module design row.
_ARTIFACT_ALIASES = {"application-design": "module-design"}


class _ReferenceSelection(RuntimeModel):
    artifact_type: str = "application-design"
    template_ref: str | None = None
    template_version: str | None = Field(default=None, max_length=256)
    example_refs: list[str] = Field(default_factory=list, max_length=1000)
    inspection_status: Literal["unverified", "verified", "inaccessible"] = (
        "unverified"
    )
    project_source_refs: list[str] = Field(
        default_factory=list, max_length=1000
    )


def _objects(value: JsonValue, field: str) -> list[dict[str, JsonValue]]:
    if not isinstance(value, list) or not all(
        isinstance(row, dict) for row in value
    ):
        raise RuntimeFailure(
            "catalog_invalid", f"Catalog {field} must be an object array."
        )
    return [row for row in value if isinstance(row, dict)]


def _string(value: JsonValue, field: str) -> str:
    if not isinstance(value, str) or not value:
        raise RuntimeFailure(
            "catalog_invalid", f"Catalog {field} must be a nonempty string."
        )
    return value


def _strings(value: JsonValue, field: str) -> list[str]:
    if not isinstance(value, list) or not all(
        isinstance(row, str) and row for row in value
    ):
        raise RuntimeFailure(
            "catalog_invalid", f"Catalog {field} must be a string array."
        )
    return [row for row in value if isinstance(row, str)]


class ReferenceCatalog:
    def __init__(self, registry_path: Path) -> None:
        self.registry_path = Path(registry_path)

    def load(self) -> dict[str, JsonValue]:
        try:
            with self.registry_path.open("rb") as stream:
                raw = stream.read(4 * 1024 * 1024 + 1)
        except OSError as error:
            raise RuntimeFailure(
                "catalog_unavailable", "Reference catalog cannot be read."
            ) from error
        if len(raw) > 4 * 1024 * 1024:
            raise RuntimeFailure(
                "catalog_invalid", "Reference catalog exceeds byte limit."
            )
        try:
            result = _JSON_OBJECT.validate_python(parse_json(raw), strict=True)
        except (
            ValueError,
            UnicodeDecodeError,
            RecursionError,
            ValidationError,
        ) as error:
            raise RuntimeFailure(
                "catalog_invalid", "Reference catalog is not valid JSON."
            ) from error
        if (
            type(result.get("schema_version")) is not int
            or result["schema_version"] != 1
        ):
            raise RuntimeFailure(
                "catalog_invalid", "Unsupported reference catalog schema."
            )
        sources = _objects(result.get("sources"), "sources")
        artifacts = _objects(result.get("artifacts"), "artifacts")
        known_ids = set()
        source_ids = set()
        for source in sources:
            identifier = _string(source.get("id"), "source.id")
            if (
                not _REFERENCE_ID.fullmatch(identifier)
                or identifier in known_ids
            ):
                raise RuntimeFailure(
                    "catalog_invalid",
                    f"Duplicate or invalid catalog ID: {identifier}",
                )
            known_ids.add(identifier)
            source_ids.add(identifier)
            _string(source.get("name"), "source.name")
            validate_http_url(
                _string(source.get("url"), "source.url"),
                code="catalog_invalid",
            )
        for artifact in artifacts:
            identifier = _string(artifact.get("id"), "artifact.id")
            if (
                not _REFERENCE_ID.fullmatch(identifier)
                or identifier in known_ids
            ):
                raise RuntimeFailure(
                    "catalog_invalid",
                    f"Duplicate or invalid catalog ID: {identifier}",
                )
            known_ids.add(identifier)
            _string(artifact.get("name"), "artifact.name")
            _string(
                artifact.get("original_status"), "artifact.original_status"
            )
            _string(
                artifact.get("original_observation"),
                "artifact.original_observation",
            )
            _strings(artifact.get("starter_fields"), "artifact.starter_fields")
            references = _strings(
                artifact.get("public_reference_ids"),
                "artifact.public_reference_ids",
            )
            if (
                len(references) != len(set(references))
                or not set(references) <= source_ids
            ):
                raise RuntimeFailure(
                    "catalog_invalid",
                    f"Invalid public reference IDs: {identifier}",
                )
            if artifact.get("template_rules_are_not_skill_rules") is not True:
                raise RuntimeFailure(
                    "catalog_invalid",
                    "Template fields cannot replace original Skill rules.",
                )
        count = result.get("source_document_type_count")
        if type(count) is not int or count != len(artifacts):
            raise RuntimeFailure(
                "catalog_invalid",
                "Catalog artifact count does not match its declaration.",
            )
        artifact_ids = {_string(x.get("id"), "artifact.id") for x in artifacts}
        profile_ids: set[str] = set()
        for profile in _objects(
            result.get("document_profiles", []), "document_profiles"
        ):
            profile_id = _string(profile.get("id"), "profile.id")
            target = _string(profile.get("artifact_id"), "profile.artifact_id")
            if (
                profile_id in profile_ids
                or profile_id in source_ids
                or target not in artifact_ids
            ):
                raise RuntimeFailure(
                    "catalog_invalid", "Invalid document profile mapping."
                )
            profile_ids.add(profile_id)
            for field in (
                "name",
                "suggested_primary_skill",
                "review_skill",
                "verification_skill",
            ):
                _string(profile.get(field), "profile." + field)
        return result

    def validate_manifest(
        self, manifest: dict[str, JsonValue]
    ) -> dict[str, JsonValue]:
        # Derived observations are always rebuilt; callers cannot assert URL access.
        supplied = {
            key: value
            for key, value in manifest.items()
            if key not in _DERIVED_FIELDS
        }
        try:
            selection = _ReferenceSelection.model_validate(supplied)
        except ValidationError as error:
            raise RuntimeFailure(
                "invalid_reference_manifest",
                "Reference manifest has invalid fields.",
            ) from error
        registry = self.load()
        sources = {
            _string(source.get("id"), "source.id"): source
            for source in _objects(registry.get("sources"), "sources")
        }
        artifacts = {
            _string(artifact.get("id"), "artifact.id"): artifact
            for artifact in _objects(registry.get("artifacts"), "artifacts")
        }
        profile = next(
            (
                row
                for row in _objects(
                    registry.get("document_profiles", []), "document_profiles"
                )
                if row.get("id") == selection.artifact_type
            ),
            None,
        )
        catalog_artifact_id = (
            _string(profile.get("artifact_id"), "profile.artifact_id")
            if profile
            else _ARTIFACT_ALIASES.get(
                selection.artifact_type, selection.artifact_type
            )
        )
        if catalog_artifact_id not in artifacts:
            raise RuntimeFailure(
                "invalid_reference_manifest", "Unknown artifact type."
            )
        references = selection.example_refs + (
            [selection.template_ref]
            if selection.template_ref is not None
            else []
        )
        if any(reference not in sources for reference in references):
            raise RuntimeFailure(
                "invalid_reference_manifest", "Unknown selected reference ID."
            )
        if len(selection.example_refs) != len(set(selection.example_refs)):
            raise RuntimeFailure(
                "invalid_reference_manifest", "Duplicate example reference ID."
            )
        if (
            selection.template_version is not None
            and selection.template_ref is None
        ):
            raise RuntimeFailure(
                "invalid_reference_manifest",
                "Template version needs a selected template.",
            )
        if any(
            not identifier or len(identifier) > 256
            for identifier in selection.project_source_refs
        ):
            raise RuntimeFailure(
                "invalid_reference_manifest",
                "Invalid project source reference ID.",
            )
        if len(selection.project_source_refs) != len(
            set(selection.project_source_refs)
        ):
            raise RuntimeFailure(
                "invalid_reference_manifest",
                "Duplicate project source reference ID.",
            )
        artifact = artifacts[catalog_artifact_id]

        def selected_source(identifier: str) -> dict[str, JsonValue]:
            source = copy.deepcopy(sources[identifier])
            source["read_in_this_run"] = False
            source["inspection_origin"] = "registry_prior_observation"
            return source

        template = (
            selected_source(selection.template_ref)
            if selection.template_ref is not None
            else None
        )
        version_status = (
            "not_selected"
            if selection.template_version is None
            else "unverified"
        )
        if (
            template is not None
            and selection.template_version is not None
            and "version" in template
        ):
            if template["version"] != selection.template_version:
                raise RuntimeFailure(
                    "invalid_reference_manifest",
                    "Selected template version does not match the catalog.",
                )
            version_status = "registry_declared"
        return {
            "artifact_type": selection.artifact_type,
            "catalog_artifact_id": catalog_artifact_id,
            "document_profile": copy.deepcopy(profile),
            "template_ref": selection.template_ref,
            "template_version": selection.template_version,
            "example_refs": list(selection.example_refs),
            "inspection_status": selection.inspection_status,
            "project_source_refs": list(selection.project_source_refs),
            "artifact": copy.deepcopy(artifact),
            "selected_template": template,
            "selected_examples": [
                selected_source(identifier)
                for identifier in selection.example_refs
            ],
            "original_reference": {
                "status": artifact["original_status"],
                "observation": artifact["original_observation"],
                "checked_date": artifact.get(
                    "checked_date", registry.get("checked_date")
                ),
                "source_page": registry.get("source_page"),
                "read_in_this_run": False,
            },
            "public_reference_status": "metadata_only",
            "template_version_status": version_status,
        }
