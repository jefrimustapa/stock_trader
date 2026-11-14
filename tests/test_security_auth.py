import unittest
from pathlib import Path
from unittest.mock import MagicMock

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import HTTPException
from bridge.src.config import BridgeConfig
from bridge.src.security import authenticate_request, verify_cf_access_jwt


class TestSecurityAuth(unittest.TestCase):
    """
    Tests dual-path authentication and Cloudflare Access origin verification.
    """

    def setUp(self):
        BridgeConfig.PAPERCLIP_BRIDGE_SECRET = "secret-paperclip-token-999"
        BridgeConfig.BRIDGE_SERVICE_TOKEN = "secret-service-token-888"
        BridgeConfig.CF_ACCESS_AUD = "cf-aud-stock-trader"

    def test_missing_credentials_raises_401(self):
        req = MagicMock()
        req.headers = {}
        with self.assertRaises(HTTPException) as ctx:
            authenticate_request(req)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_valid_paperclip_bearer_token_authenticates(self):
        req = MagicMock()
        req.headers = {
            "Authorization": "Bearer secret-paperclip-token-999"
        }
        caller = authenticate_request(req)
        self.assertEqual(caller, "paperclip_agent")

    def test_invalid_paperclip_bearer_token_raises_403(self):
        req = MagicMock()
        req.headers = {
            "Authorization": "Bearer wrong-token"
        }
        with self.assertRaises(HTTPException) as ctx:
            authenticate_request(req)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_valid_internal_service_token_authenticates(self):
        req = MagicMock()
        req.headers = {
            "X-Service-Token": "Bearer secret-service-token-888"
        }
        caller = authenticate_request(req)
        self.assertEqual(caller, "internal_service")

    def test_cf_access_jwt_validation(self):
        # Empty token returns False
        self.assertFalse(verify_cf_access_jwt(""))


if __name__ == "__main__":
    unittest.main()
