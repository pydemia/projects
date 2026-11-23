"""Story verification history without rewriting existing requirements."""

import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "story_verifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("item_id", sa.String(36), nullable=False),
        sa.Column("item_revision", sa.Integer(), nullable=False),
        sa.Column(
            "actor_id",
            sa.String(36),
            sa.ForeignKey("accounts.id"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=False),
        sa.Column("criterion_results", sa.JSON(), nullable=False),
        sa.Column("criteria_hash", sa.String(64), nullable=False),
        sa.ForeignKeyConstraint(
            ["item_id", "item_revision"],
            ["revisions.item_id", "revisions.revision"],
        ),
        sa.UniqueConstraint("item_id", "item_revision"),
    )
    op.create_index(
        "ix_story_verifications_item_id", "story_verifications", ["item_id"]
    )
    op.execute("""
        CREATE FUNCTION prevent_story_verification_mutation() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN
          RAISE EXCEPTION 'Story verifications are append-only';
        END $$
    """)
    op.execute("""
        CREATE TRIGGER story_verification_immutable
        BEFORE UPDATE OR DELETE ON story_verifications
        FOR EACH ROW EXECUTE FUNCTION prevent_story_verification_mutation()
    """)


def downgrade() -> None:
    if (
        op.get_bind()
        .execute(sa.text("SELECT count(*) FROM story_verifications"))
        .scalar()
    ):
        raise RuntimeError(
            "Preserve Story verification history before downgrade"
        )
    op.drop_table("story_verifications")
    op.execute("DROP FUNCTION prevent_story_verification_mutation()")
