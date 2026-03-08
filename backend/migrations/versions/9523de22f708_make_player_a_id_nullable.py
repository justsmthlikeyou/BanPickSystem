"""make player_a_id nullable

Revision ID: 9523de22f708
Revises: 3f596aa495bd
Create Date: 2026-03-04 20:42:10.553416

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9523de22f708'
down_revision: Union[str, None] = '3f596aa495bd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('draft_sessions', schema=None) as batch_op:
        batch_op.alter_column('player_a_id',
               existing_type=sa.INTEGER(),
               nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('draft_sessions', schema=None) as batch_op:
        batch_op.alter_column('player_a_id',
               existing_type=sa.INTEGER(),
               nullable=False)
