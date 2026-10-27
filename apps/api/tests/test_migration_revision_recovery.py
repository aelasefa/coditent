"""Keep existing database version markers resolvable without destructive DDL."""
import ast
import importlib.util
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory


API_ROOT = Path(__file__).resolve().parents[1]


def test_orphaned_revision_is_resolvable_and_follows_known_predecessor():
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    scripts = ScriptDirectory.from_config(config)
    revision = scripts.get_revision("ac1b2c3d4e5f")
    assert revision.down_revision == "ab1b2c3d4e5f"
    assert scripts.get_heads() == ["ah1b2c3d4e5f"]
    assert any(item.revision == revision.revision for item in scripts.walk_revisions())


def test_active_user_default_follows_compatibility_marker():
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    scripts = ScriptDirectory.from_config(config)
    revision = scripts.get_revision("ad1b2c3d4e5f")
    assert revision.down_revision == "ac1b2c3d4e5f"


def test_latest_migrations_form_one_linear_chain():
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    scripts = ScriptDirectory.from_config(config)
    assert scripts.get_revision("ae1b2c3d4e5f").down_revision == "ad1b2c3d4e5f"
    assert scripts.get_revision("af1b2c3d4e5f").down_revision == "ae1b2c3d4e5f"
    assert scripts.get_revision("ag1b2c3d4e5f").down_revision == "af1b2c3d4e5f"
    assert scripts.get_revision("ah1b2c3d4e5f").down_revision == "ag1b2c3d4e5f"


def test_compatibility_marker_emits_no_schema_or_data_operations():
    path = API_ROOT / "alembic/versions/ac1b2c3d4e5f_reconcile_missing_revision.py"
    tree = ast.parse(path.read_text())
    for node in tree.body:
        if isinstance(node, ast.FunctionDef):
            assert node.name in {"upgrade", "downgrade"}
            assert len(node.body) == 1 and isinstance(node.body[0], ast.Pass)
    spec = importlib.util.spec_from_file_location("recovered_revision", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.upgrade() is None
    assert module.downgrade() is None
