"""Owner-wide immutable typed task field definitions."""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_field_definitions",
        sa.Column(
            "owner_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            primary_key=True,
        ),
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("options", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("revision > 0"),
        sa.CheckConstraint(
            "type IN ('text','number','date','select','checkbox')"
        ),
    )


def downgrade() -> None:
    if (
        op.get_bind()
        .execute(sa.text("SELECT count(*) FROM task_field_definitions"))
        .scalar()
    ):
        raise RuntimeError(
            "사용자 필드 정의를 보존한 뒤 이전 schema로 복원하세요."
        )
    op.drop_table("task_field_definitions")
