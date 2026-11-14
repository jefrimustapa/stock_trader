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
        # Empty or whitespace token returns False
        self.assertFalse(verify_cf_access_jwt(""))
        self.assertFalse(verify_cf_access_jwt("   "))

    def test_cf_access_jwt_unsigned_forged_token_rejected_fail_closed(self):
        # A token with valid claims and aud, but no signature or alg:none must be rejected fail-closed
        import jwt
        payload = {"aud": "cf-aud-stock-trader", "email": "attacker@evil.com"}
        # Forged token without signature
        forged_token = jwt.encode(payload, key="", algorithm="none")
        self.assertFalse(
            verify_cf_access_jwt(forged_token),
            "Unsigned or alg:none token must be rejected fail-closed"
        )

    def test_cf_access_jwt_jwks_failure_rejected_fail_closed(self):
        from unittest.mock import patch
        import jwt
        # RS256 token with valid header
        token = jwt.encode({"aud": "cf-aud-stock-trader"}, "dummy_key_with_sufficient_length_for_hmac_sha256", algorithm="HS256")
        
        with patch("jwt.PyJWKClient") as mock_jwks:
            mock_jwks.side_effect = Exception("JWKS network error")
            self.assertFalse(
                verify_cf_access_jwt(token),
                "JWKS network failure must reject fail-closed without claims fallback"
            )

    def test_cf_access_jwt_valid_rs256_verification(self):
        from unittest.mock import patch, MagicMock
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
        import jwt

        # Generate test RSA key pair
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem_public_key = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )

        token = jwt.encode(
            {"aud": "cf-aud-stock-trader", "email": "trader@home-crew.lan"},
            private_key,
            algorithm="RS256",
            headers={"kid": "test-cf-kid-1"}
        )

        with patch("jwt.PyJWKClient") as mock_jwks_cls:
            mock_client = MagicMock()
            mock_signing_key = MagicMock()
            mock_signing_key.key = pem_public_key
            mock_client.get_signing_key_from_jwt.return_value = mock_signing_key
            mock_jwks_cls.return_value = mock_client

            # Valid token
            self.assertTrue(verify_cf_access_jwt(token))

            # Mismatched AUD
            self.assertFalse(verify_cf_access_jwt(token, expected_aud="different-aud"))


if __name__ == "__main__":
    unittest.main()
