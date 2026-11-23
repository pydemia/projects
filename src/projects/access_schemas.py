"""Typed requests and public project access responses."""

from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AccessRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1)
    operation_id: str = Field(min_length=1, max_length=100)


class RoleCreate(AccessRequest):
    name: str = Field(min_length=1, max_length=80)
    permissions: list[str] = Field(max_length=30)


class RoleUpdate(RoleCreate):
    pass


class MemberRoleUpdate(AccessRequest):
    role_id: str = Field(min_length=1, max_length=36)


class InvitationCreate(MemberRoleUpdate):
    account_id: str | None = Field(default=None, max_length=36)
    tenant_id: str | None = Field(default=None, max_length=36)
    subject: str | None = Field(default=None, max_length=255)
    expires_in_hours: int = Field(default=72, ge=1, le=168)

    @model_validator(mode="after")
    def valid_target(self) -> Self:
        if (self.tenant_id is None) != (self.subject is None):
            raise ValueError("tenant_id and subject must be supplied together")
        if self.account_id and self.tenant_id:
            raise ValueError("Choose account_id or tenant_id/subject")
        return self


class InvitationPreviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str = Field(min_length=20, max_length=200)


class InvitationAccept(AccessRequest):
    token: str = Field(min_length=20, max_length=200)


class OwnershipRequest(AccessRequest):
    account_id: str = Field(min_length=1, max_length=36)
    expires_in_hours: int = Field(default=24, ge=1, le=168)


class ArchiveUpdate(AccessRequest):
    archived: bool


class RoleDTO(BaseModel):
    id: str
    name: str
    preset: Literal["owner", "editor", "viewer", "custom"]


class ProjectAccessDTO(BaseModel):
    project_id: str
    access_revision: int
    membership_id: str
    role: RoleDTO
    capabilities: list[str]
    archived: bool


class InvitationDTO(BaseModel):
    id: str
    project_id: str
    role_id: str
    kind: str
    target_account_id: str | None
    expires_at: datetime
    claimed_by: str | None
    revoked_at: datetime | None


class InvitationPreviewDTO(BaseModel):
    project_id: str
    project_name: str
    access_revision: int
    role: RoleDTO
    kind: Literal["membership", "ownership"]
    expires_at: datetime
