from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND = Path(__file__).resolve().parents[1]


def test_revision_ids_fit_alembic_version_column() -> None:
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "alembic"))
    scripts = ScriptDirectory.from_config(config)
    # Cột alembic_version.version_num mặc định là VARCHAR(32) trên PostgreSQL.
    revisions = [script.revision for script in scripts.walk_revisions()]
    assert revisions
    assert [revision for revision in revisions if len(revision) > 32] == []
    # Một chuỗi migration duy nhất, không rẽ nhánh.
    assert len(scripts.get_heads()) == 1
