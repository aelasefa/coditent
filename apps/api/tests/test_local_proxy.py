"""Opt-in checks against the loopback Docker proxy (no accounts required).

LOCAL_PROXY_TEST_URL=http://127.0.0.1:3001 python -m pytest tests/test_local_proxy.py
"""
import os
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

import pytest


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


@pytest.fixture
def proxy_url():
    url = os.getenv("LOCAL_PROXY_TEST_URL")
    if not url:
        pytest.skip("set LOCAL_PROXY_TEST_URL to test the running Docker proxy")
    parsed = urlsplit(url)
    assert parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}
    return url.rstrip("/")


def request(url, headers=None):
    browser_headers = {
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.7",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/154.0.0.0",
        "Sec-CH-UA": '"Chromium";v="154", "Not A Brand";v="24"',
        "Cookie": "local_probe=1; preference=light",
        **(headers or {}),
    }
    try:
        return build_opener(NoRedirect).open(Request(url, headers=browser_headers), timeout=15)
    except HTTPError as response:
        return response


@pytest.mark.parametrize("path", ["/login", "/register", "/privacy", "/terms"])
@pytest.mark.parametrize("host", ["localhost:3001", "127.0.0.1:3001"])
def test_browser_headers_allow_local_pages_without_https_redirect(proxy_url, path, host):
    with request(proxy_url + path, {"Host": host}) as response:
        assert response.status == 200
        assert response.headers.get("Location") is None
        assert response.headers.get("Strict-Transport-Security") is None


@pytest.mark.parametrize("path", ["/health", "/api-proxy/health"])
def test_local_http_routes_to_api(proxy_url, path):
    with request(proxy_url + path) as response:
        assert response.status == 200
        assert b'"status":"ok"' in response.read()


@pytest.mark.parametrize("value", [";id", "$(id)", "' OR 1=1 --", "<script>alert(1)</script>"])
def test_waf_still_blocks_malicious_arguments(proxy_url, value):
    with request(proxy_url + "/login?" + urlencode({"q": value})) as response:
        assert response.status == 403


def test_nonlocal_hostname_retains_https_redirect(proxy_url):
    with request(proxy_url + "/login", {"Host": "example.invalid"}) as response:
        assert response.status == 308
        assert response.headers["Location"] == "https://example.invalid:8443/login"
