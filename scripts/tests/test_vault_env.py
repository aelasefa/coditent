# Exercise real export quoting and fail-closed Vault behavior without Docker or real credentials.
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch
import urllib.error

SPEC = importlib.util.spec_from_file_location('vault_env', Path(__file__).resolve().parents[1] / 'vault-env.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class VaultEnvTests(unittest.TestCase):
    def run_client(self, data=None, failure=False, sealed=False, production=False, policies=None):
        calls = []
        bundle = data if data is not None else {
            'DATABASE_URL': 'postgresql://example.invalid/app',
            'JWT_SECRET': "quoted'\nvalue$(`false`)",
            'GEMINI_API_KEY': 'fake-provider-key',
        }

        def urlopen(req, timeout):
            path = req.full_url.split('/v1/')[1]
            calls.append((path, req.headers.get('X-vault-token')))
            if path == 'sys/seal-status':
                result = {'initialized': True, 'sealed': sealed}
            elif path == 'auth/approle/login':
                assert json.loads(req.data)['role_id'] == 'role'
                result = {'auth': {'client_token': 'short-lived', 'policies': policies or ['default', 'member']}}
            elif path == 'auth/token/revoke-self':
                result = {}
            elif failure:
                raise urllib.error.HTTPError(req.full_url, 403, 'Forbidden', {}, None)
            else:
                result = {'data': {'data': bundle}}
            return contextlib.closing(io.BytesIO(json.dumps(result).encode()))

        output = io.StringIO()
        with patch.dict(os.environ, {'VAULT_ADDR': 'http://localhost:8200', 'VAULT_ROLE_ID': 'role', 'VAULT_SECRET_ID': 'secret'}), patch.object(MODULE.urllib.request, 'urlopen', urlopen), patch('sys.argv', ['vault-env.py'] + (['--production'] if production else [])), contextlib.redirect_stdout(output):
            try:
                MODULE.main()
            except Exception as error:
                return calls, output.getvalue(), error
        return calls, output.getvalue(), None

    def test_exports_preserve_quotes_newlines_and_shell_metacharacters(self):
        calls, output, error = self.run_client()
        self.assertIsNone(error)
        result = subprocess.run(['bash', '-c', output + '\nprintf "%s" "$JWT_SECRET"'], capture_output=True, text=True, check=True)
        self.assertEqual(result.stdout, "quoted'\nvalue$(`false`)")
        self.assertEqual(calls[-1], ('auth/token/revoke-self', 'short-lived'))

    def test_read_denied_revokes_token_and_exports_nothing(self):
        calls, output, error = self.run_client(failure=True)
        self.assertIsInstance(error, urllib.error.HTTPError)
        self.assertEqual(output, '')
        self.assertEqual(calls[-1][0], 'auth/token/revoke-self')

    def test_unsafe_variable_cannot_change_compose_or_shell(self):
        calls, output, error = self.run_client({'COMPOSE_FILE': 'attacker.yml'})
        self.assertIsInstance(error, ValueError)
        self.assertEqual(output, '')
        self.assertEqual(calls[-1][0], 'auth/token/revoke-self')

    def test_sealed_vault_never_attempts_login(self):
        calls, output, error = self.run_client(sealed=True)
        self.assertIsInstance(error, RuntimeError)
        self.assertEqual(output, '')
        self.assertEqual(len(calls), 1)

    def production_bundle(self):
        return {
            'DATABASE_URL': 'postgresql://example.invalid/app',
            'JWT_SECRET': 'test-signing-key-with-at-least-thirty-two-bytes',
            'GEMINI_API_KEY': 'fake-provider-key',
            'FRONTEND_URL': 'https://example.invalid',
            'CORS_ORIGINS': 'https://example.invalid,https://www.example.invalid',
            'TOTP_ENCRYPTION_KEY': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        }

    def test_production_accepts_member_with_valid_bundle(self):
        calls, output, error = self.run_client(self.production_bundle(), production=True)
        self.assertIsNone(error)
        self.assertIn('export DATABASE_URL=', output)
        self.assertEqual(calls[-1][0], 'auth/token/revoke-self')

    def test_production_rejects_admin_and_revokes_token(self):
        calls, output, error = self.run_client(self.production_bundle(), production=True, policies=['default', 'admin'])
        self.assertIsInstance(error, ValueError)
        self.assertIn('member AppRole', str(error))
        self.assertEqual(output, '')
        self.assertEqual(calls[-1][0], 'auth/token/revoke-self')

    def test_production_rejects_local_origins(self):
        data = self.production_bundle()
        data['FRONTEND_URL'] = 'http://localhost:3001'
        calls, output, error = self.run_client(data, production=True)
        self.assertIsInstance(error, ValueError)
        self.assertEqual(output, '')
        self.assertEqual(calls[-1][0], 'auth/token/revoke-self')

    def test_production_requires_email_encryption_when_email_is_enabled(self):
        data = self.production_bundle()
        data['RESEND_API_KEY'] = 'fake-email-key'
        calls, output, error = self.run_client(data, production=True)
        self.assertIsInstance(error, ValueError)
        self.assertIn('EMAIL_OUTBOX_ENCRYPTION_KEY', str(error))
        self.assertEqual(output, '')
        self.assertEqual(calls[-1][0], 'auth/token/revoke-self')


if __name__ == '__main__':
    unittest.main()
