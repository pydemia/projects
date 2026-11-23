"""Current project membership policy and serialized access administration."""

import hashlib
import json
import secrets
from collections.abc import Iterable
from datetime import timedelta

from sqlalchemy import Select, cast, func, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from projects.access_schemas import (
    AccessRequest,
    ArchiveUpdate,
    InvitationAccept,
    InvitationCreate,
    InvitationDTO,
    InvitationPreviewDTO,
    MemberRoleUpdate,
    OwnershipRequest,
    ProjectAccessDTO,
    RoleCreate,
    RoleDTO,
    RoleUpdate,
)
from projects.database import (
    Account,
    EntraIdentity,
    Project,
    ProjectAccessEvent,
    ProjectInvitation,
    ProjectMembership,
    ProjectPreference,
    ProjectRole,
    new_id,
    utcnow,
)
from projects.domain import Problem

PERMISSIONS = frozenset(
    {
        "project.read",
        "project.update",
        "task.create",
        "task.update",
        "task.move",
        "item.write",
        "relation.write",
        "baseline.write",
        "test.write",
        "field.manage",
        "run.execute",
        "run.apply",
        "project.export",
        "project.import",
        "project.archive",
        "member.manage",
        "role.manage",
        "ownership.transfer",
    }
)
OWNER_ONLY = frozenset(
    {"project.archive", "member.manage", "role.manage", "ownership.transfer"}
)
READ_PERMISSIONS = frozenset({"project.read", "project.export"})
DEFAULT_PERMISSIONS = {
    "owner": PERMISSIONS,
    "editor": PERMISSIONS - OWNER_ONLY,
    "viewer": READ_PERMISSIONS,
}


def validate_permissions(permissions: list[str]) -> list[str]:
    values = set(permissions)
    if len(values) != len(permissions) or not values <= PERMISSIONS:
        raise Problem(422, "알 수 없거나 중복된 권한입니다.")
    if values & OWNER_ONLY:
        raise Problem(422, "관리 권한은 오너 역할에만 부여할 수 있습니다.")
    if values and "project.read" not in values:
        raise Problem(422, "다른 동작에는 프로젝트 보기 권한이 필요합니다.")
    if "run.apply" in values and not values & {
        "task.create",
        "task.update",
        "item.write",
        "relation.write",
    }:
        raise Problem(422, "결과 적용에는 변경 대상의 쓰기 권한이 필요합니다.")
    return sorted(values)


def lock_project_access(db: Session, ids: Iterable[str]) -> None:
    # Every ACL mutation and protected data write takes this same lock first.
    list(
        db.scalars(
            select(Project)
            .where(Project.id.in_(sorted(set(ids))))
            .order_by(Project.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    )


def _membership(
    db: Session, project_id: str, user_id: str
) -> tuple[ProjectMembership, ProjectRole] | None:
    row = db.execute(
        select(ProjectMembership, ProjectRole)
        .join(
            ProjectRole,
            (ProjectMembership.project_id == ProjectRole.project_id)
            & (ProjectMembership.role_id == ProjectRole.id),
        )
        .where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.account_id == user_id,
        )
        .execution_options(populate_existing=True)
    ).first()
    return (row[0], row[1]) if row else None


def _capabilities(project: Project, role: ProjectRole) -> list[str]:
    values = set(role.permissions) & PERMISSIONS
    if role.preset != "owner":
        values -= OWNER_ONLY
    if project.archived:
        values &= READ_PERMISSIONS | (
            OWNER_ONLY if role.preset == "owner" else set()
        )
    return sorted(values)


def require_project_access(
    db: Session,
    project_id: str,
    user_id: str,
    permission: str = "project.read",
    *,
    lock: bool = False,
) -> Project:
    if permission not in PERMISSIONS:
        raise ValueError(f"Unknown project permission: {permission}")
    if lock or permission not in READ_PERMISSIONS:
        lock_project_access(db, [project_id])
    project = db.scalar(
        select(Project)
        .where(Project.id == project_id)
        .execution_options(populate_existing=True)
    )
    membership = _membership(db, project_id, user_id)
    if (
        project is None
        or membership is None
        or "project.read" not in membership[1].permissions
    ):
        raise Problem(404, "프로젝트를 찾을 수 없습니다.")
    if permission not in _capabilities(project, membership[1]):
        raise Problem(
            403, "이 프로젝트에서 요청한 동작을 수행할 권한이 없습니다."
        )
    return project


def accessible_project_ids(
    db: Session, user_id: str, permission: str = "project.read"
) -> Select[tuple[str]]:
    if permission not in PERMISSIONS:
        raise ValueError(f"Unknown project permission: {permission}")
    statement = (
        select(Project.id)
        .join(ProjectMembership, ProjectMembership.project_id == Project.id)
        .join(
            ProjectRole,
            (ProjectRole.project_id == Project.id)
            & (ProjectRole.id == ProjectMembership.role_id),
        )
        .where(
            ProjectMembership.account_id == user_id,
            cast(ProjectRole.permissions, JSONB).contains(
                ["project.read", permission]
            ),
        )
    )
    if permission in OWNER_ONLY:
        statement = statement.where(ProjectRole.preset == "owner")
    if permission not in READ_PERMISSIONS:
        statement = statement.where(
            (Project.archived.is_(False))
            | (
                (ProjectRole.preset == "owner")
                if permission in OWNER_ONLY
                else False
            )
        )
    return statement


def project_access(db: Session, project_id: str, user_id: str) -> dict:
    # One statement prevents a revocation between membership and role reads.
    row = db.execute(
        select(Project, ProjectMembership, ProjectRole)
        .join(ProjectMembership, ProjectMembership.project_id == Project.id)
        .join(
            ProjectRole,
            (ProjectRole.project_id == Project.id)
            & (ProjectRole.id == ProjectMembership.role_id),
        )
        .where(
            Project.id == project_id, ProjectMembership.account_id == user_id
        )
        .execution_options(populate_existing=True)
    ).first()
    if row is None or "project.read" not in row[2].permissions:
        raise Problem(404, "프로젝트를 찾을 수 없습니다.")
    project, member, role = row
    return ProjectAccessDTO(
        project_id=project.id,
        access_revision=project.access_revision,
        membership_id=member.id,
        role=RoleDTO.model_validate(
            {"id": role.id, "name": role.name, "preset": role.preset}
        ),
        capabilities=_capabilities(project, role),
        archived=project.archived,
    ).model_dump()


def initialize_project_access(db: Session, project: Project) -> None:
    db.flush()
    lock_project_access(db, [project.id])
    # Only initialize new/imported projects; never use owner_id as an ACL fallback.
    if db.scalar(
        select(ProjectRole.id)
        .where(ProjectRole.project_id == project.id)
        .limit(1)
    ):
        return
    roles = {}
    for preset, name in [
        ("owner", "오너"),
        ("editor", "에디터"),
        ("viewer", "뷰어"),
    ]:
        role = ProjectRole(
            id=new_id(),
            project_id=project.id,
            name=name,
            preset=preset,
            permissions=sorted(DEFAULT_PERMISSIONS[preset]),
        )
        db.add(role)
        roles[preset] = role
    db.flush()
    db.add(
        ProjectMembership(
            project_id=project.id,
            account_id=project.owner_id,
            role_id=roles["owner"].id,
        )
    )
    db.add(
        ProjectPreference(
            account_id=project.owner_id,
            project_id=project.id,
            sort_order=project.sort_order,
        )
    )
    db.flush()


def access_fingerprint(
    db: Session, user_id: str, project_ids: Iterable[str] | None = None
) -> str:
    statement = (
        select(
            Project.id,
            Project.access_revision,
            Project.archived,
            ProjectMembership.id,
            ProjectRole.id,
            ProjectRole.revision,
            ProjectRole.permissions,
        )
        .join(ProjectMembership, ProjectMembership.project_id == Project.id)
        .join(
            ProjectRole,
            (ProjectRole.project_id == Project.id)
            & (ProjectRole.id == ProjectMembership.role_id),
        )
        .where(ProjectMembership.account_id == user_id)
        .order_by(Project.id)
    )
    if project_ids is not None:
        statement = statement.where(Project.id.in_(list(project_ids)))
    rows = [list(row) for row in db.execute(statement)]
    return hashlib.sha256(
        json.dumps([user_id, rows], sort_keys=True).encode()
    ).hexdigest()


def _role(db: Session, project_id: str, role_id: str) -> ProjectRole:
    role = db.get(ProjectRole, role_id)
    if role is None or role.project_id != project_id:
        raise Problem(422, "해당 프로젝트의 역할을 선택해 주세요.")
    return role


def _role_dict(db: Session, role: ProjectRole) -> dict:
    return {
        "id": role.id,
        "name": role.name,
        "preset": role.preset,
        "permissions": sorted(role.permissions),
        "revision": role.revision,
        "member_count": db.scalar(
            select(func.count())
            .select_from(ProjectMembership)
            .where(
                ProjectMembership.project_id == role.project_id,
                ProjectMembership.role_id == role.id,
            )
        )
        or 0,
    }


def list_roles(db: Session, project_id: str, actor_id: str) -> list[dict]:
    require_project_access(db, project_id, actor_id)
    membership = _membership(db, project_id, actor_id)
    assert membership is not None
    if membership[1].preset != "owner":
        role = membership[1]
        return [
            {
                "id": role.id,
                "name": role.name,
                "preset": role.preset,
                "permissions": sorted(role.permissions),
                "revision": role.revision,
            }
        ]
    return [
        _role_dict(db, role)
        for role in db.scalars(
            select(ProjectRole)
            .where(ProjectRole.project_id == project_id)
            .order_by(ProjectRole.preset, ProjectRole.name)
        )
    ]


def list_members(db: Session, project_id: str, actor_id: str) -> list[dict]:
    require_project_access(db, project_id, actor_id, "member.manage")
    return [
        {
            "membership_id": member.id,
            "account_id": account.id,
            "username": account.username,
            "role_id": role.id,
            "role": {"id": role.id, "name": role.name, "preset": role.preset},
        }
        for member, account, role in db.execute(
            select(ProjectMembership, Account, ProjectRole)
            .join(Account, Account.id == ProjectMembership.account_id)
            .join(
                ProjectRole,
                (ProjectRole.project_id == ProjectMembership.project_id)
                & (ProjectRole.id == ProjectMembership.role_id),
            )
            .where(ProjectMembership.project_id == project_id)
            .order_by(Account.username)
        )
    ]


def _invitation_dict(invitation: ProjectInvitation) -> dict:
    return InvitationDTO.model_validate(
        invitation, from_attributes=True
    ).model_dump(mode="json")


def list_invitations(
    db: Session, project_id: str, actor_id: str
) -> list[dict]:
    require_project_access(db, project_id, actor_id, "member.manage")
    return [
        _invitation_dict(invitation)
        for invitation in db.scalars(
            select(ProjectInvitation)
            .where(ProjectInvitation.project_id == project_id)
            .order_by(ProjectInvitation.expires_at)
        )
    ]


def _request_hash(
    action: str, target_id: str | None, payload: AccessRequest
) -> str:
    # Hash the token without retaining it in the audit payload.
    return hashlib.sha256(
        json.dumps(
            [action, target_id, payload.model_dump()], sort_keys=True
        ).encode()
    ).hexdigest()


def _begin(
    db: Session,
    project_id: str,
    actor_id: str,
    permission: str,
    action: str,
    payload: AccessRequest,
    target_id: str | None = None,
) -> tuple[Project, dict | None]:
    project = require_project_access(
        db, project_id, actor_id, permission, lock=True
    )
    return project, _replay(db, project, actor_id, action, payload, target_id)


def _replay(
    db: Session,
    project: Project,
    actor_id: str,
    action: str,
    payload: AccessRequest,
    target_id: str | None,
) -> dict | None:
    event = db.scalar(
        select(ProjectAccessEvent).where(
            ProjectAccessEvent.project_id == project.id,
            ProjectAccessEvent.actor_id == actor_id,
            ProjectAccessEvent.operation_id == payload.operation_id,
        )
    )
    if event:
        if event.request_hash != _request_hash(action, target_id, payload):
            raise Problem(
                409, "동일 operation_id를 다른 요청에 사용할 수 없습니다."
            )
        return dict(event.result)
    if project.access_revision != payload.expected_revision:
        raise Problem(
            409,
            "프로젝트 권한이 변경되었습니다. 새로 고친 후 다시 시도해 주세요.",
        )
    return None


def _finish(
    db: Session,
    project: Project,
    actor_id: str,
    action: str,
    payload: AccessRequest,
    result: dict,
    *,
    target_id: str | None = None,
    before: dict | None = None,
    after: dict | None = None,
) -> dict:
    project.access_revision += 1
    result = {**result, "access_revision": project.access_revision}
    safe_result = {
        key: value for key, value in result.items() if key != "token"
    }
    db.add(
        ProjectAccessEvent(
            project_id=project.id,
            actor_id=actor_id,
            action=action,
            target_id=target_id,
            before=before or {},
            after=after or {},
            operation_id=payload.operation_id,
            request_hash=_request_hash(action, target_id, payload),
            result=safe_result,
        )
    )
    db.flush()
    return result


def create_role(
    db: Session, project_id: str, actor_id: str, payload: RoleCreate
) -> dict:
    project, replay = _begin(
        db, project_id, actor_id, "role.manage", "role.create", payload
    )
    if replay is not None:
        return replay
    permissions = validate_permissions(payload.permissions)
    name = payload.name.strip()
    if not name or db.scalar(
        select(ProjectRole.id).where(
            ProjectRole.project_id == project_id, ProjectRole.name == name
        )
    ):
        raise Problem(
            422, "프로젝트에서 사용하지 않은 역할 이름을 입력해 주세요."
        )
    role = ProjectRole(
        id=new_id(),
        project_id=project_id,
        name=name,
        preset="custom",
        permissions=permissions,
    )
    db.add(role)
    db.flush()
    return _finish(
        db,
        project,
        actor_id,
        "role.create",
        payload,
        _role_dict(db, role),
        after={"role_id": role.id, "permissions": permissions},
    )


def update_role(
    db: Session,
    project_id: str,
    actor_id: str,
    role_id: str,
    payload: RoleUpdate,
) -> dict:
    project, replay = _begin(
        db,
        project_id,
        actor_id,
        "role.manage",
        "role.update",
        payload,
        role_id,
    )
    if replay is not None:
        return replay
    role = _role(db, project_id, role_id)
    if role.preset != "custom":
        raise Problem(
            422,
            "기본 역할은 변경할 수 없습니다. 복사하여 사용자 지정 역할을 만드세요.",
        )
    permissions = validate_permissions(payload.permissions)
    name = payload.name.strip()
    if not name or db.scalar(
        select(ProjectRole.id).where(
            ProjectRole.project_id == project_id,
            ProjectRole.name == name,
            ProjectRole.id != role_id,
        )
    ):
        raise Problem(
            422, "프로젝트에서 사용하지 않은 역할 이름을 입력해 주세요."
        )
    before = {"name": role.name, "permissions": list(role.permissions)}
    role.name, role.permissions, role.revision = (
        name,
        permissions,
        role.revision + 1,
    )
    return _finish(
        db,
        project,
        actor_id,
        "role.update",
        payload,
        _role_dict(db, role),
        target_id=role_id,
        before=before,
        after={"name": name, "permissions": permissions},
    )


def delete_role(
    db: Session,
    project_id: str,
    actor_id: str,
    role_id: str,
    payload: AccessRequest,
) -> dict:
    project, replay = _begin(
        db,
        project_id,
        actor_id,
        "role.manage",
        "role.delete",
        payload,
        role_id,
    )
    if replay is not None:
        return replay
    role = _role(db, project_id, role_id)
    if role.preset != "custom" or db.scalar(
        select(ProjectMembership.id)
        .where(ProjectMembership.role_id == role_id)
        .limit(1)
    ):
        raise Problem(
            422, "기본 역할 또는 사용 중인 역할은 삭제할 수 없습니다."
        )
    if db.scalar(
        select(ProjectInvitation.id)
        .where(ProjectInvitation.role_id == role_id)
        .limit(1)
    ):
        raise Problem(422, "초대에서 참조하는 역할은 삭제할 수 없습니다.")
    db.delete(role)
    return _finish(
        db,
        project,
        actor_id,
        "role.delete",
        payload,
        {"deleted": True},
        target_id=role_id,
    )


def _target_account(db: Session, payload: InvitationCreate) -> str | None:
    account_id = payload.account_id
    if payload.tenant_id:
        account_id = db.scalar(
            select(EntraIdentity.account_id).where(
                EntraIdentity.tenant_id == payload.tenant_id,
                EntraIdentity.subject == payload.subject,
            )
        )
        if account_id is None:
            raise Problem(
                422,
                "로그인한 계정의 tenant/subject를 선택하거나 일회성 초대를 사용해 주세요.",
            )
    if account_id and db.get(Account, account_id) is None:
        raise Problem(422, "초대할 계정을 확인할 수 없습니다.")
    return account_id


def _new_invitation(
    db: Session,
    project: Project,
    actor_id: str,
    role: ProjectRole,
    target_account_id: str | None,
    hours: int,
    kind: str,
) -> tuple[ProjectInvitation, str]:
    token = secrets.token_urlsafe(32)
    invitation = ProjectInvitation(
        id=new_id(),
        project_id=project.id,
        role_id=role.id,
        target_account_id=target_account_id,
        created_by=actor_id,
        kind=kind,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=utcnow() + timedelta(hours=hours),
    )
    db.add(invitation)
    db.flush()
    return invitation, token


def create_invitation(
    db: Session, project_id: str, actor_id: str, payload: InvitationCreate
) -> dict:
    project, replay = _begin(
        db, project_id, actor_id, "member.manage", "invitation.create", payload
    )
    if replay is not None:
        return replay
    role = _role(db, project_id, payload.role_id)
    if role.preset == "owner":
        raise Problem(422, "오너 지정에는 소유권 이전을 사용해 주세요.")
    target = _target_account(db, payload)
    if target and _membership(db, project_id, target):
        raise Problem(422, "이미 프로젝트에 참여 중인 계정입니다.")
    invitation, token = _new_invitation(
        db,
        project,
        actor_id,
        role,
        target,
        payload.expires_in_hours,
        "membership",
    )
    return _finish(
        db,
        project,
        actor_id,
        "invitation.create",
        payload,
        {**_invitation_dict(invitation), "token": token},
        after={
            "invitation_id": invitation.id,
            "role_id": role.id,
            "account_id": target,
        },
    )


def revoke_invitation(
    db: Session,
    project_id: str,
    actor_id: str,
    invitation_id: str,
    payload: AccessRequest,
) -> dict:
    project, replay = _begin(
        db,
        project_id,
        actor_id,
        "member.manage",
        "invitation.revoke",
        payload,
        invitation_id,
    )
    if replay is not None:
        return replay
    invitation = db.get(ProjectInvitation, invitation_id)
    if invitation is None or invitation.project_id != project_id:
        raise Problem(404, "초대를 찾을 수 없습니다.")
    if invitation.claimed_by or invitation.revoked_at:
        raise Problem(409, "이미 수락하거나 철회한 초대입니다.")
    invitation.revoked_at = utcnow()
    return _finish(
        db,
        project,
        actor_id,
        "invitation.revoke",
        payload,
        _invitation_dict(invitation),
        target_id=invitation_id,
    )


def preview_invitation(
    db: Session, invitation_id: str, actor_id: str, token: str
) -> dict:
    row = db.execute(
        select(ProjectInvitation, Project, ProjectRole)
        .join(Project, Project.id == ProjectInvitation.project_id)
        .join(
            ProjectRole,
            (ProjectRole.project_id == Project.id)
            & (ProjectRole.id == ProjectInvitation.role_id),
        )
        .where(ProjectInvitation.id == invitation_id)
        .execution_options(populate_existing=True)
    ).first()
    if row is None:
        raise Problem(404, "초대를 찾을 수 없습니다.")
    invitation, project, role = row
    # A bearer secret and stable account ID authorize this limited preview.
    # Email/username and organization-wide membership cannot substitute for it.
    if (
        not secrets.compare_digest(
            invitation.token_hash, hashlib.sha256(token.encode()).hexdigest()
        )
        or (
            invitation.target_account_id is not None
            and invitation.target_account_id != actor_id
        )
        or db.get(Account, actor_id) is None
    ):
        raise Problem(404, "초대를 찾을 수 없습니다.")
    # Keep role details, invitation state and preview revision consistent.
    # Accept still rechecks all of them in its own transaction.
    lock_project_access(db, [project.id])
    db.refresh(invitation)
    db.refresh(role)
    if (
        invitation.claimed_by
        or invitation.revoked_at
        or invitation.expires_at <= utcnow()
    ):
        raise Problem(409, "만료되었거나 이미 사용한 초대입니다.")
    grant = project_access(db, project.id, invitation.created_by)
    permission = (
        "ownership.transfer"
        if invitation.kind == "ownership"
        else "member.manage"
    )
    if permission not in grant["capabilities"]:
        raise Problem(404, "초대를 찾을 수 없습니다.")
    membership = _membership(db, project.id, actor_id)
    if invitation.kind == "ownership":
        if membership is None:
            raise Problem(404, "초대를 찾을 수 없습니다.")
    elif project.archived:
        raise Problem(403, "보관된 프로젝트의 초대는 수락할 수 없습니다.")
    elif membership is not None:
        raise Problem(409, "이미 프로젝트에 참여 중인 계정입니다.")
    return InvitationPreviewDTO.model_validate(
        {
            "project_id": project.id,
            "project_name": project.name,
            "access_revision": project.access_revision,
            "role": {"id": role.id, "name": role.name, "preset": role.preset},
            "kind": invitation.kind,
            "expires_at": invitation.expires_at,
        }
    ).model_dump(mode="json")


def _accept(
    db: Session,
    invitation_id: str,
    actor_id: str,
    payload: InvitationAccept,
    kind: str,
) -> dict:
    invitation = db.get(ProjectInvitation, invitation_id)
    if invitation is None or invitation.kind != kind:
        raise Problem(404, "초대를 찾을 수 없습니다.")
    lock_project_access(db, [invitation.project_id])
    db.refresh(invitation)
    project = db.get(Project, invitation.project_id)
    assert project is not None
    # Verify bearer token and immutable target before revealing any metadata.
    if not secrets.compare_digest(
        invitation.token_hash,
        hashlib.sha256(payload.token.encode()).hexdigest(),
    ) or (
        invitation.target_account_id is not None
        and invitation.target_account_id != actor_id
    ):
        raise Problem(404, "초대를 찾을 수 없습니다.")
    action = f"{kind}.accept"
    replay = _replay(db, project, actor_id, action, payload, invitation_id)
    if replay is not None:
        return replay
    if (
        invitation.claimed_by
        or invitation.revoked_at
        or invitation.expires_at <= utcnow()
    ):
        raise Problem(409, "만료되었거나 이미 사용한 초대입니다.")
    require_project_access(
        db,
        project.id,
        invitation.created_by,
        "ownership.transfer" if kind == "ownership" else "member.manage",
        lock=True,
    )
    member = _membership(db, project.id, actor_id)
    before = {}
    if kind == "ownership":
        if member is None:
            raise Problem(
                422, "현재 프로젝트 멤버만 소유권을 수락할 수 있습니다."
            )
        before = {"role_id": member[0].role_id}
        member[0].role_id = invitation.role_id
        source = _membership(db, project.id, invitation.created_by)
        assert source is not None
        editor = db.scalar(
            select(ProjectRole).where(
                ProjectRole.project_id == project.id,
                ProjectRole.preset == "editor",
            )
        )
        assert editor is not None
        source[0].role_id = editor.id
        # owner_id remains repository identity metadata, never an access fallback.
    else:
        if project.archived:
            raise Problem(403, "보관된 프로젝트의 초대는 수락할 수 없습니다.")
        if member is not None:
            raise Problem(409, "이미 프로젝트에 참여 중인 계정입니다.")
        db.add(
            ProjectMembership(
                project_id=project.id,
                account_id=actor_id,
                role_id=invitation.role_id,
            )
        )
    if db.get(ProjectPreference, (actor_id, project.id)) is None:
        db.add(ProjectPreference(account_id=actor_id, project_id=project.id))
    invitation.claimed_by, invitation.claimed_at = actor_id, utcnow()
    return _finish(
        db,
        project,
        actor_id,
        action,
        payload,
        {"project_id": project.id, "accepted": True},
        target_id=invitation_id,
        before=before,
        after={"role_id": invitation.role_id},
    )


def accept_invitation(
    db: Session, invitation_id: str, actor_id: str, payload: InvitationAccept
) -> dict:
    return _accept(db, invitation_id, actor_id, payload, "membership")


def change_member_role(
    db: Session,
    project_id: str,
    actor_id: str,
    account_id: str,
    payload: MemberRoleUpdate,
) -> dict:
    project, replay = _begin(
        db,
        project_id,
        actor_id,
        "member.manage",
        "member.role",
        payload,
        account_id,
    )
    if replay is not None:
        return replay
    member = _membership(db, project_id, account_id)
    if member is None:
        raise Problem(404, "멤버를 찾을 수 없습니다.")
    role = _role(db, project_id, payload.role_id)
    if role.preset == "owner" or member[1].preset == "owner":
        raise Problem(
            422, "오너 역할 변경에는 명시적 소유권 이전을 사용해 주세요."
        )
    before = {"role_id": member[0].role_id}
    member[0].role_id = role.id
    return _finish(
        db,
        project,
        actor_id,
        "member.role",
        payload,
        {
            "account_id": account_id,
            "membership_id": member[0].id,
            "role_id": role.id,
        },
        target_id=account_id,
        before=before,
        after={"role_id": role.id},
    )


def _remove_member(
    db: Session,
    project: Project,
    actor_id: str,
    account_id: str,
    payload: AccessRequest,
    action: str,
) -> dict:
    member = _membership(db, project.id, account_id)
    if member is None:
        raise Problem(404, "멤버를 찾을 수 없습니다.")
    if member[1].preset == "owner":
        count = db.scalar(
            select(func.count())
            .select_from(ProjectMembership)
            .join(ProjectRole, ProjectRole.id == ProjectMembership.role_id)
            .where(
                ProjectMembership.project_id == project.id,
                ProjectRole.preset == "owner",
            )
        )
        if count == 1:
            raise Problem(409, "마지막 오너는 제거하거나 탈퇴할 수 없습니다.")
    before = {"role_id": member[0].role_id, "membership_id": member[0].id}
    db.delete(member[0])
    return _finish(
        db,
        project,
        actor_id,
        action,
        payload,
        {"removed": True},
        target_id=account_id,
        before=before,
    )


def remove_member(
    db: Session,
    project_id: str,
    actor_id: str,
    account_id: str,
    payload: AccessRequest,
) -> dict:
    project, replay = _begin(
        db,
        project_id,
        actor_id,
        "member.manage",
        "member.remove",
        payload,
        account_id,
    )
    if replay is not None:
        return replay
    return _remove_member(
        db, project, actor_id, account_id, payload, "member.remove"
    )


def leave_project(
    db: Session, project_id: str, actor_id: str, payload: AccessRequest
) -> dict:
    project, replay = _begin(
        db,
        project_id,
        actor_id,
        "project.read",
        "member.leave",
        payload,
        actor_id,
    )
    if replay is not None:
        return replay
    membership = _membership(db, project_id, actor_id)
    assert membership is not None
    if project.archived and membership[1].preset != "owner":
        raise Problem(
            403, "보관된 프로젝트에서는 오너만 권한을 변경할 수 있습니다."
        )
    return _remove_member(
        db, project, actor_id, actor_id, payload, "member.leave"
    )


def request_ownership(
    db: Session, project_id: str, actor_id: str, payload: OwnershipRequest
) -> dict:
    project, replay = _begin(
        db,
        project_id,
        actor_id,
        "ownership.transfer",
        "ownership.request",
        payload,
    )
    if replay is not None:
        return replay
    member = _membership(db, project_id, payload.account_id)
    if (
        member is None
        or payload.account_id == actor_id
        or member[1].preset == "owner"
    ):
        raise Problem(422, "소유권을 받을 현재 프로젝트 멤버를 선택해 주세요.")
    role = db.scalar(
        select(ProjectRole).where(
            ProjectRole.project_id == project_id, ProjectRole.preset == "owner"
        )
    )
    assert role is not None
    invitation, token = _new_invitation(
        db,
        project,
        actor_id,
        role,
        payload.account_id,
        payload.expires_in_hours,
        "ownership",
    )
    return _finish(
        db,
        project,
        actor_id,
        "ownership.request",
        payload,
        {**_invitation_dict(invitation), "token": token},
        after={
            "account_id": payload.account_id,
            "invitation_id": invitation.id,
        },
    )


def accept_ownership(
    db: Session, invitation_id: str, actor_id: str, payload: InvitationAccept
) -> dict:
    return _accept(db, invitation_id, actor_id, payload, "ownership")


def set_project_archived(
    db: Session, project_id: str, actor_id: str, payload: ArchiveUpdate
) -> dict:
    project, replay = _begin(
        db, project_id, actor_id, "project.archive", "project.archive", payload
    )
    if replay is not None:
        return replay
    membership = _membership(db, project_id, actor_id)
    assert membership is not None
    if membership[1].preset != "owner":
        raise Problem(403, "오너만 프로젝트를 보관하거나 복원할 수 있습니다.")
    before = {"archived": project.archived}
    project.archived = payload.archived
    return _finish(
        db,
        project,
        actor_id,
        "project.archive",
        payload,
        {"archived": project.archived},
        before=before,
        after={"archived": project.archived},
    )
