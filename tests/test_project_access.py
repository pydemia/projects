"""Project policy integration against the fixture's random PostgreSQL schema."""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from projects.access_schemas import (
    AccessRequest,
    ArchiveUpdate,
    InvitationAccept,
    InvitationCreate,
    MemberRoleUpdate,
    OwnershipRequest,
    RoleCreate,
    RoleUpdate,
)
from projects.database import (
    Account,
    Project,
    ProjectAccessEvent,
    ProjectInvitation,
    ProjectMembership,
    ProjectPreference,
    ProjectRole,
    ProjectTaskFieldDefinition,
    TaskFieldDefinition,
    new_id,
    utcnow,
)
from projects.domain import Problem
from projects.project_access import (
    PERMISSIONS,
    accept_invitation,
    accept_ownership,
    access_fingerprint,
    accessible_project_ids,
    change_member_role,
    create_invitation,
    create_role,
    initialize_project_access,
    leave_project,
    list_members,
    list_roles,
    preview_invitation,
    project_access,
    remove_member,
    request_ownership,
    require_project_access,
    revoke_invitation,
    set_project_archived,
    update_role,
)


@pytest.fixture
def policy(engine):
    with Session(engine) as db:
        accounts = [
            Account(
                id=new_id(), username=f"user-{index}", password_hash="unused"
            )
            for index in range(4)
        ]
        db.add_all(accounts)
        db.flush()
        projects = [
            Project(
                id=new_id(),
                owner_id=accounts[0].id,
                name=f"project-{index}",
                sort_order=index,
            )
            for index in range(3)
        ]
        db.add_all(projects)
        for project in projects:
            initialize_project_access(db, project)
        db.commit()
        yield db, accounts, projects


def role_id(db, project, preset):
    return db.scalar(
        select(ProjectRole.id).where(
            ProjectRole.project_id == project.id, ProjectRole.preset == preset
        )
    )


def request(project, **kwargs):
    return {
        "expected_revision": project.access_revision,
        "operation_id": new_id(),
        **kwargs,
    }


def join(db, project, owner, account, preset):
    invite = create_invitation(
        db,
        project.id,
        owner.id,
        InvitationCreate(
            **request(
                project,
                role_id=role_id(db, project, preset),
                account_id=account.id,
            )
        ),
    )
    accept_invitation(
        db,
        invite["id"],
        account.id,
        InvitationAccept(**request(project, token=invite["token"])),
    )
    db.flush()


def test_project_memberships_roles_and_no_owner_bypass(policy):
    db, accounts, projects = policy
    owner, user = accounts[:2]
    a, b, c = projects
    join(db, a, owner, user, "editor")
    join(db, b, owner, user, "viewer")
    assert set(db.scalars(accessible_project_ids(db, user.id))) == {a.id, b.id}
    assert set(
        db.scalars(accessible_project_ids(db, user.id, "task.update"))
    ) == {a.id}
    require_project_access(db, a.id, user.id, "task.update")
    with pytest.raises(Problem) as denied:
        require_project_access(db, b.id, user.id, "task.update")
    assert denied.value.status == 403
    with pytest.raises(Problem) as hidden:
        require_project_access(db, c.id, user.id)
    assert hidden.value.status == 404
    membership = db.scalar(
        select(ProjectMembership).where(ProjectMembership.project_id == c.id)
    )
    db.delete(membership)
    db.flush()
    with pytest.raises(Problem) as no_fallback:
        require_project_access(db, c.id, owner.id)
    assert no_fallback.value.status == 404
    assert project_access(db, a.id, user.id)["role"]["preset"] == "editor"


def test_protected_default_roles_and_current_custom_permissions(policy):
    db, accounts, projects = policy
    owner, user = accounts[:2]
    project = projects[0]
    join(db, project, owner, user, "editor")
    custom = create_role(
        db,
        project.id,
        owner.id,
        RoleCreate(
            **request(
                project,
                name="Limited",
                permissions=["project.read", "task.update"],
            )
        ),
    )
    change_member_role(
        db,
        project.id,
        owner.id,
        user.id,
        MemberRoleUpdate(**request(project, role_id=custom["id"])),
    )
    require_project_access(db, project.id, user.id, "task.update")
    before = access_fingerprint(db, user.id)
    update_role(
        db,
        project.id,
        owner.id,
        custom["id"],
        RoleUpdate(
            **request(project, name="Limited", permissions=["project.read"])
        ),
    )
    assert before != access_fingerprint(db, user.id)
    with pytest.raises(Problem) as denied:
        require_project_access(db, project.id, user.id, "task.update")
    assert denied.value.status == 403
    for permissions in [
        ["project.read", "member.manage"],
        ["task.update"],
        ["project.read", "unknown"],
        ["project.read", "run.apply"],
    ]:
        with pytest.raises(Problem):
            create_role(
                db,
                project.id,
                owner.id,
                RoleCreate(
                    **request(project, name="Invalid", permissions=permissions)
                ),
            )
    with pytest.raises(Problem):
        update_role(
            db,
            project.id,
            owner.id,
            role_id(db, project, "owner"),
            RoleUpdate(
                **request(project, name="No", permissions=["project.read"])
            ),
        )
    assert len(list_roles(db, project.id, user.id)) == 1
    assert "member_count" not in list_roles(db, project.id, user.id)[0]
    with pytest.raises(Problem):
        list_members(db, project.id, user.id)


def test_cross_project_role_rejected_by_service_and_database(policy):
    db, accounts, projects = policy
    owner, user = accounts[:2]
    a, b = projects[:2]
    wrong_role = role_id(db, b, "viewer")
    with pytest.raises(Problem):
        create_invitation(
            db,
            a.id,
            owner.id,
            InvitationCreate(**request(a, role_id=wrong_role)),
        )
    with pytest.raises(IntegrityError), db.begin_nested():
        db.add(
            ProjectMembership(
                project_id=a.id, account_id=user.id, role_id=wrong_role
            )
        )
        db.flush()


def test_invitation_is_one_use_targeted_expiring_and_audited_without_token(
    policy,
):
    db, accounts, projects = policy
    owner, user, stranger = accounts[:3]
    project = projects[0]
    invite = create_invitation(
        db,
        project.id,
        owner.id,
        InvitationCreate(
            **request(
                project,
                role_id=role_id(db, project, "viewer"),
                account_id=user.id,
            )
        ),
    )
    token = invite["token"]
    assert token not in str(list(db.scalars(select(ProjectAccessEvent))))
    events = db.scalars(select(ProjectAccessEvent)).all()
    assert all(
        token not in str((event.before, event.after, event.result))
        for event in events
    )
    with pytest.raises(Problem) as wrong:
        accept_invitation(
            db,
            invite["id"],
            stranger.id,
            InvitationAccept(**request(project, token=token)),
        )
    assert wrong.value.status == 404
    stored = db.get(ProjectInvitation, invite["id"])
    assert stored.token_hash != token
    stored.expires_at = utcnow() - timedelta(seconds=1)
    with pytest.raises(Problem):
        accept_invitation(
            db,
            invite["id"],
            user.id,
            InvitationAccept(**request(project, token=token)),
        )
    stored.expires_at = utcnow() + timedelta(hours=1)
    payload = InvitationAccept(**request(project, token=token))
    result = accept_invitation(db, invite["id"], user.id, payload)
    assert accept_invitation(db, invite["id"], user.id, payload) == result
    with pytest.raises(Problem):
        accept_invitation(
            db,
            invite["id"],
            user.id,
            InvitationAccept(**request(project, token=token)),
        )


def test_revoked_invitation_and_stale_request(policy):
    db, accounts, projects = policy
    owner, user = accounts[:2]
    project = projects[0]
    old_revision = project.access_revision
    invitation = create_invitation(
        db,
        project.id,
        owner.id,
        InvitationCreate(
            **request(project, role_id=role_id(db, project, "viewer"))
        ),
    )
    with pytest.raises(Problem) as stale:
        accept_invitation(
            db,
            invitation["id"],
            user.id,
            InvitationAccept(
                expected_revision=old_revision,
                operation_id=new_id(),
                token=invitation["token"],
            ),
        )
    assert stale.value.status == 409
    revoke_invitation(
        db,
        project.id,
        owner.id,
        invitation["id"],
        AccessRequest(**request(project)),
    )
    with pytest.raises(Problem):
        accept_invitation(
            db,
            invitation["id"],
            user.id,
            InvitationAccept(**request(project, token=invitation["token"])),
        )


def test_removal_and_rejoin_changes_membership_identity(policy):
    db, accounts, projects = policy
    owner, user = accounts[:2]
    project = projects[0]
    join(db, project, owner, user, "editor")
    before = project_access(db, project.id, user.id)["membership_id"]
    remove_member(
        db, project.id, owner.id, user.id, AccessRequest(**request(project))
    )
    join(db, project, owner, user, "viewer")
    assert project_access(db, project.id, user.id)["membership_id"] != before


def test_last_owner_protection_and_target_accepts_ownership(policy):
    db, accounts, projects = policy
    owner, user = accounts[:2]
    project = projects[0]
    with pytest.raises(Problem) as last:
        leave_project(
            db, project.id, owner.id, AccessRequest(**request(project))
        )
    assert last.value.status == 409
    join(db, project, owner, user, "viewer")
    invitation = request_ownership(
        db,
        project.id,
        owner.id,
        OwnershipRequest(**request(project, account_id=user.id)),
    )
    assert (
        project_access(db, project.id, user.id)["role"]["preset"] == "viewer"
    )
    accept_ownership(
        db,
        invitation["id"],
        user.id,
        InvitationAccept(**request(project, token=invitation["token"])),
    )
    assert project_access(db, project.id, user.id)["role"]["preset"] == "owner"
    assert (
        project_access(db, project.id, owner.id)["role"]["preset"] == "editor"
    )
    with pytest.raises(Problem):
        leave_project(
            db, project.id, user.id, AccessRequest(**request(project))
        )


def test_archived_project_reads_and_owner_management_only(policy):
    db, accounts, projects = policy
    owner, user = accounts[:2]
    project = projects[0]
    join(db, project, owner, user, "editor")
    set_project_archived(
        db,
        project.id,
        owner.id,
        ArchiveUpdate(**request(project, archived=True)),
    )
    require_project_access(db, project.id, user.id)
    require_project_access(db, project.id, user.id, "project.export")
    for actor in [owner, user]:
        with pytest.raises(Problem):
            require_project_access(db, project.id, actor.id, "task.update")
    assert (
        "task.update"
        not in project_access(db, project.id, owner.id)["capabilities"]
    )
    assert not list(
        db.scalars(accessible_project_ids(db, user.id, "task.update"))
    )
    create_role(
        db,
        project.id,
        owner.id,
        RoleCreate(
            **request(
                project, name="Archive reader", permissions=["project.read"]
            )
        ),
    )
    set_project_archived(
        db,
        project.id,
        owner.id,
        ArchiveUpdate(**request(project, archived=False)),
    )
    require_project_access(db, project.id, user.id, "task.update")


def test_idempotency_and_independent_personal_preferences(policy):
    db, accounts, projects = policy
    owner, user = accounts[:2]
    project = projects[0]
    payload = RoleCreate(
        **request(project, name="Custom", permissions=["project.read"])
    )
    created = create_role(db, project.id, owner.id, payload)
    assert create_role(db, project.id, owner.id, payload) == created
    payload.name = "Different"
    with pytest.raises(Problem) as conflicting:
        create_role(db, project.id, owner.id, payload)
    assert conflicting.value.status == 409
    join(db, project, owner, user, "viewer")
    owner_preference = db.get(ProjectPreference, (owner.id, project.id))
    user_preference = db.get(ProjectPreference, (user.id, project.id))
    user_preference.sort_order = 99
    db.flush()
    assert owner_preference.sort_order == 0


def test_initializer_preserves_personal_library_and_is_idempotent(policy):
    db, accounts, projects = policy
    owner = accounts[0]
    field = TaskFieldDefinition(
        owner_id=owner.id, name="Legacy", type="text", options=[]
    )
    db.add(field)
    db.flush()
    project = Project(owner_id=owner.id, name="Import")
    db.add(project)
    initialize_project_access(db, project)
    initialize_project_access(db, project)
    assert db.get(ProjectTaskFieldDefinition, (project.id, field.id)) is None
    assert db.get(TaskFieldDefinition, (owner.id, field.id)).name == "Legacy"
    assert (
        len(
            db.scalars(
                select(ProjectRole).where(ProjectRole.project_id == project.id)
            ).all()
        )
        == 3
    )


def test_concurrent_access_mutations_only_one_revision_wins(policy, engine):
    db, accounts, projects = policy
    owner_id, project_id = accounts[0].id, projects[0].id
    barrier = Barrier(2)

    def mutate(index):
        with Session(engine) as session:
            barrier.wait(timeout=10)
            try:
                create_role(
                    session,
                    project_id,
                    owner_id,
                    RoleCreate(
                        expected_revision=1,
                        operation_id=new_id(),
                        name=f"Concurrent {index}",
                        permissions=["project.read"],
                    ),
                )
                session.commit()
                return 200
            except Problem as problem:
                session.rollback()
                return problem.status

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(mutate, range(2))) == [200, 409]


def test_migration_backfills_legacy_owner_fields_and_order(engine):
    with engine.begin() as connection:
        config = Config("alembic.ini")
        config.attributes["connection"] = connection
        command.downgrade(config, "0010")
        account_id, project_id, second_id, field_id = [
            new_id() for _ in range(4)
        ]
        connection.execute(
            text(
                "INSERT INTO accounts(id, username, password_hash) VALUES (:id, 'legacy', 'unused')"
            ),
            {"id": account_id},
        )
        for index, identifier in enumerate([project_id, second_id]):
            connection.execute(
                text(
                    "INSERT INTO projects(id, owner_id, name, goal, profile, sort_order, repository_path, version, created_at) VALUES (:id, :owner, :name, '', 'simple', :sort, '', 4, CURRENT_TIMESTAMP)"
                ),
                {
                    "id": identifier,
                    "owner": account_id,
                    "name": f"Legacy {index}",
                    "sort": 7 + index,
                },
            )
        connection.execute(
            text(
                "INSERT INTO task_field_definitions(owner_id, id, name, type, options, revision, created_at) VALUES (:owner, :id, 'Preserved', 'text', '[]', 3, CURRENT_TIMESTAMP)"
            ),
            {"owner": account_id, "id": field_id},
        )
        command.upgrade(config, "head")
    with Session(engine) as db:
        for index, identifier in enumerate([project_id, second_id]):
            access = project_access(db, identifier, account_id)
            assert access["role"]["preset"] == "owner"
            assert access["access_revision"] == 1
            assert set(access["capabilities"]) == PERMISSIONS
            editor = db.scalar(
                select(ProjectRole).where(
                    ProjectRole.project_id == identifier,
                    ProjectRole.preset == "editor",
                )
            )
            assert len(editor.permissions) == 14
            assert not {
                "project.archive",
                "task.delete",
                "project.delete",
            } & set(editor.permissions)
            assert db.get(Project, identifier).version == 4
            assert (
                db.get(ProjectPreference, (account_id, identifier)).sort_order
                == 7 + index
            )
            assert (
                db.get(
                    ProjectTaskFieldDefinition, (identifier, field_id)
                ).revision
                == 3
            )
        assert db.get(TaskFieldDefinition, (account_id, field_id)) is not None


def test_old_invitation_preview_refreshes_revision_without_reissue(policy):
    db, accounts, projects = policy
    owner, user, wrong = accounts[:3]
    project = projects[0]
    invitation = create_invitation(
        db,
        project.id,
        owner.id,
        InvitationCreate(
            **request(
                project,
                role_id=role_id(db, project, "viewer"),
                account_id=user.id,
            )
        ),
    )
    old_revision = invitation["access_revision"]
    create_role(
        db,
        project.id,
        owner.id,
        RoleCreate(
            **request(
                project, name="Unrelated role", permissions=["project.read"]
            )
        ),
    )
    for actor, token in [
        (wrong.id, invitation["token"]),
        (user.id, "x" * 43),
        (new_id(), invitation["token"]),
    ]:
        with pytest.raises(Problem) as hidden:
            preview_invitation(db, invitation["id"], actor, token)
        assert hidden.value.status == 404
        assert project.name not in str(hidden.value)
    preview = preview_invitation(
        db, invitation["id"], user.id, invitation["token"]
    )
    assert set(preview) == {
        "project_id",
        "project_name",
        "access_revision",
        "role",
        "kind",
        "expires_at",
    }
    assert preview["project_name"] == project.name
    assert preview["access_revision"] > old_revision
    assert preview["kind"] == "membership"
    with pytest.raises(Problem) as stale:
        accept_invitation(
            db,
            invitation["id"],
            user.id,
            InvitationAccept(
                expected_revision=old_revision,
                operation_id=new_id(),
                token=invitation["token"],
            ),
        )
    assert stale.value.status == 409
    accepted = accept_invitation(
        db,
        invitation["id"],
        user.id,
        InvitationAccept(
            expected_revision=preview["access_revision"],
            operation_id=new_id(),
            token=invitation["token"],
        ),
    )
    assert accepted["accepted"] is True
    with pytest.raises(Problem):
        preview_invitation(db, invitation["id"], user.id, invitation["token"])


def test_invitation_preview_enforces_expiry_revocation_and_ownership_membership(
    policy,
):
    db, accounts, projects = policy
    owner, user = accounts[:2]
    project = projects[0]
    invitation = create_invitation(
        db,
        project.id,
        owner.id,
        InvitationCreate(
            **request(project, role_id=role_id(db, project, "viewer"))
        ),
    )
    stored = db.get(ProjectInvitation, invitation["id"])
    stored.expires_at = utcnow() - timedelta(seconds=1)
    with pytest.raises(Problem):
        preview_invitation(db, invitation["id"], user.id, invitation["token"])
    stored.expires_at = utcnow() + timedelta(hours=1)
    revoke_invitation(
        db,
        project.id,
        owner.id,
        invitation["id"],
        AccessRequest(**request(project)),
    )
    with pytest.raises(Problem):
        preview_invitation(db, invitation["id"], user.id, invitation["token"])
    join(db, project, owner, user, "viewer")
    ownership = request_ownership(
        db,
        project.id,
        owner.id,
        OwnershipRequest(**request(project, account_id=user.id)),
    )
    assert (
        preview_invitation(db, ownership["id"], user.id, ownership["token"])[
            "kind"
        ]
        == "ownership"
    )
    remove_member(
        db, project.id, owner.id, user.id, AccessRequest(**request(project))
    )
    with pytest.raises(Problem) as hidden:
        preview_invitation(db, ownership["id"], user.id, ownership["token"])
    assert hidden.value.status == 404


def test_reserved_deletes_and_custom_archive_are_unavailable(policy):
    db, accounts, projects = policy
    owner, user = accounts[:2]
    project = projects[0]
    assert len(PERMISSIONS) == 18
    assert not {"task.delete", "project.delete"} & PERMISSIONS
    for permission in ["task.delete", "project.delete", "project.archive"]:
        with pytest.raises(Problem) as rejected:
            create_role(
                db,
                project.id,
                owner.id,
                RoleCreate(
                    **request(
                        project,
                        name="Invalid grant",
                        permissions=["project.read", permission],
                    )
                ),
            )
        assert rejected.value.status == 422
    join(db, project, owner, user, "viewer")
    custom = create_role(
        db,
        project.id,
        owner.id,
        RoleCreate(
            **request(
                project,
                name="Malformed stored grant",
                permissions=["project.read"],
            )
        ),
    )
    change_member_role(
        db,
        project.id,
        owner.id,
        user.id,
        MemberRoleUpdate(**request(project, role_id=custom["id"])),
    )
    role = db.get(ProjectRole, custom["id"])
    role.permissions = [
        "project.read",
        "project.archive",
        "project.delete",
        "task.delete",
    ]
    db.flush()
    assert project_access(db, project.id, user.id)["capabilities"] == [
        "project.read"
    ]
    assert not list(
        db.scalars(accessible_project_ids(db, user.id, "project.archive"))
    )
    with pytest.raises(Problem) as denied:
        require_project_access(db, project.id, user.id, "project.archive")
    assert denied.value.status == 403
    assert len(project_access(db, project.id, owner.id)["capabilities"]) == 18


def test_revoked_former_creator_can_create_independent_same_repository(policy):
    db, accounts, projects = policy
    creator, next_owner = accounts[:2]
    original = projects[0]
    original.repository_url = "https://github.com/example/repository"
    original.repository_path = "docs"
    db.flush()
    join(db, original, creator, next_owner, "editor")
    ownership = request_ownership(
        db,
        original.id,
        creator.id,
        OwnershipRequest(**request(original, account_id=next_owner.id)),
    )
    accept_ownership(
        db,
        ownership["id"],
        next_owner.id,
        InvitationAccept(**request(original, token=ownership["token"])),
    )
    leave_project(
        db, original.id, creator.id, AccessRequest(**request(original))
    )
    duplicate = Project(
        owner_id=creator.id,
        name="Independent import",
        repository_url=original.repository_url,
        repository_path=original.repository_path,
    )
    db.add(duplicate)
    initialize_project_access(db, duplicate)
    db.flush()
    readable = set(db.scalars(accessible_project_ids(db, creator.id)))
    assert duplicate.id in readable
    assert original.id not in readable
    assert original.owner_id == creator.id
