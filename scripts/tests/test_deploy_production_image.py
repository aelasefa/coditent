import re
import unittest
from pathlib import Path


SCRIPT = (
    Path(__file__).resolve().parents[1] / "deploy-production-image.sh"
).read_text(encoding="utf-8")


class ProductionDeploymentTests(unittest.TestCase):
    def test_release_recreation_excludes_stateful_infrastructure(self):
        match = re.search(r"^RELEASE_SERVICES=\(([^)]*)\)$", SCRIPT, re.MULTILINE)

        self.assertIsNotNone(match)
        services = set(match.group(1).split())
        self.assertEqual(services, {"api", "worker", "ai-dispatcher"})
        self.assertNotIn("vault", services)
        self.assertNotIn("redis", services)

    def test_release_recreation_does_not_start_dependencies(self):
        release_commands = [
            line
            for line in SCRIPT.splitlines()
            if "--force-recreate" in line and '"${RELEASE_SERVICES[@]}"' in line
        ]

        self.assertEqual(len(release_commands), 2)
        self.assertTrue(all("--no-deps" in line for line in release_commands))


if __name__ == "__main__":
    unittest.main()
