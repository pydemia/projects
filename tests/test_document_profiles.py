import io
import json
from zipfile import ZipFile

import pytest


@pytest.mark.parametrize(
    "profile_id",
    [
        "functional-plan",
        "ui-plan",
        "system-architecture",
        "infra-design",
        "application-design",
        "interface-design",
        "implementation-plan",
    ],
)
def test_core_document_profiles_map_original_catalog(
    client, create_item, profile_id
):
    document = create_item(data={"artifact_type": profile_id})
    assert (
        client.get(f"/api/items/{document['id']}").json()["data"][
            "artifact_type"
        ]
        == profile_id
    )
    registry = client.get("/api/catalog").json()
    assert len(registry["artifacts"]) == 35
    profile = next(
        row for row in registry["document_profiles"] if row["id"] == profile_id
    )
    assert profile["artifact_id"] in {
        row["id"] for row in registry["artifacts"]
    }
    response = client.get(f"/api/items/{document['id']}/portable")
    assert response.status_code == 200
    with ZipFile(io.BytesIO(response.content)) as archive:
        refs = json.loads(archive.read("references.json"))
        assert refs["document_profile"]["id"] == profile_id
        assert refs["catalog_artifact_id"] == profile["artifact_id"]
