import ast
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODELS_PATH = ROOT / "apps/api/app/models.py"
MIGRATION_PATH = (
    ROOT / "apps/api/alembic/versions/ai1b2c3d4e5f_secure_public_schema.py"
)


def _literal_assignment(path: Path, name: str):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            if any(isinstance(target, ast.Name) and target.id == name for target in targets):
                return ast.literal_eval(node.value)
    raise AssertionError(f"{name} is not defined in {path}")


def _model_table_names() -> set[str]:
    tree = ast.parse(MODELS_PATH.read_text(encoding="utf-8"))
    names: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        if not any(
            isinstance(target, ast.Name) and target.id == "__tablename__"
            for target in targets
        ):
            continue
        value = ast.literal_eval(node.value)
        if isinstance(value, str):
            names.add(value)
    return names


class PublicSchemaSecurityTests(unittest.TestCase):
    def test_every_application_model_is_protected(self):
        protected = set(_literal_assignment(MIGRATION_PATH, "APPLICATION_TABLES"))

        self.assertEqual(protected, _model_table_names())

    def test_duplicate_indexes_are_removed_from_models(self):
        duplicate_indexes = set(
            _literal_assignment(MIGRATION_PATH, "DUPLICATE_INDEXES")
        )
        models = MODELS_PATH.read_text(encoding="utf-8")

        for index in duplicate_indexes:
            self.assertNotIn(f'Index("{index}"', models)


if __name__ == "__main__":
    unittest.main()
