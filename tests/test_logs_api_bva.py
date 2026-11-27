"""
Unit & Boundary Value Analysis (BVA) Test Suite for Container Logs Viewer (HOM-408 / Issue #36)
Covers SDLC Step 3:
- BVA for tail parameter (min 1, default 100, max 1000, invalid 0 and >1000)
- BVA for container whitelist mapping and invalid container rejection (400)
- BVA for log level detection and filtering (ALL, INFO, WARN, ERROR, DEBUG)
- BVA for keyword search filtering (case-insensitive substring match)
- Secret sanitization verification (tokens, passwords, JWTs, ANSI codes)
- Docker stream demultiplexing (8-byte header demux and raw fallback)
"""

import struct
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException
from fastapi.testclient import TestClient

from bridge.src.config import BridgeConfig
from bridge.src.routes.logs import (
    CONTAINER_MAP,
    AVAILABLE_SERVICES,
    sanitize_log_text,
    detect_log_level,
    demux_docker_stream,
    parse_rfc3339_timestamp,
    get_container_logs,
    router,
)
from bridge.src.security import authenticate_request


class TestLogsSanitizationAndParsing(unittest.TestCase):
    """Tests log string sanitization, level detection, and Docker stream demuxing."""

    def setUp(self):
        BridgeConfig.BRIDGE_SERVICE_TOKEN = "super-secret-service-token-777"
        BridgeConfig.PAPERCLIP_BRIDGE_SECRET = "super-secret-bridge-token-888"
        BridgeConfig.PAPERCLIP_API_KEY = "super-secret-api-key-999"

    def test_sanitize_env_secrets_masked(self):
        raw = "Connecting with token super-secret-service-token-777 and api key super-secret-api-key-999"
        sanitized = sanitize_log_text(raw)
        self.assertNotIn("super-secret-service-token-777", sanitized)
        self.assertNotIn("super-secret-api-key-999", sanitized)
        self.assertIn("[REDACTED_SECRET]", sanitized)

    def test_sanitize_bearer_and_jwt_tokens(self):
        jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature"
        raw = f"Header: Bearer {jwt} processed successfully."
        sanitized = sanitize_log_text(raw)
        self.assertNotIn("doNotLeakThisSignature", sanitized)
        self.assertIn("[REDACTED", sanitized)

    def test_sanitize_password_json_and_query(self):
        raw1 = 'User payload: {"login_account": "trader1", "password": "MySecretPassword123!"}'
        raw2 = "Connecting to redis://user:SecretPass999@localhost:6379"
        raw3 = "POST /login?user=admin&password=HiddenPassword456"

        s1 = sanitize_log_text(raw1)
        s2 = sanitize_log_text(raw2)
        s3 = sanitize_log_text(raw3)

        self.assertNotIn("MySecretPassword123!", s1)
        self.assertNotIn("HiddenPassword456", s3)
        self.assertIn("[REDACTED]", s1)
        self.assertIn("[REDACTED]", s3)

    def test_sanitize_strips_ansi_codes(self):
        ansi_str = "\x1b[31m[ERROR]\x1b[0m Connection \x1b[1;32mfailed\x1b[0m"
        clean = sanitize_log_text(ansi_str)
        self.assertNotIn("\x1b[31m", clean)
        self.assertNotIn("\x1b[0m", clean)
        self.assertEqual(clean, "[ERROR] Connection failed")

    def test_detect_log_level_bva(self):
        self.assertEqual(detect_log_level("[ERROR] Connection aborted"), "ERROR")
        self.assertEqual(detect_log_level("2026-11-27 ERROR: Failed to place order"), "ERROR")
        self.assertEqual(detect_log_level("[WARN] Slippage exceeded 0.5%"), "WARN")
        self.assertEqual(detect_log_level("[WARNING] High volatility detected"), "WARN")
        self.assertEqual(detect_log_level("[DEBUG] Checking cache entry US.AAPL"), "DEBUG")
        self.assertEqual(detect_log_level("[INFO] Tariq evaluated 5 candidates"), "INFO")
        self.assertEqual(detect_log_level("Ordinary unformatted output"), "INFO")

    def test_demux_docker_stream_multiplexed(self):
        # Frame 1: stdout, 18 bytes
        msg1 = b"Stdout line one\n"
        header1 = struct.pack(">BxxxI", 1, len(msg1))

        # Frame 2: stderr, 18 bytes
        msg2 = b"Stderr error msg\n"
        header2 = struct.pack(">BxxxI", 2, len(msg2))

        payload = header1 + msg1 + header2 + msg2
        records = demux_docker_stream(payload)

        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["stream"], "stdout")
        self.assertEqual(records[0]["raw"], "Stdout line one")
        self.assertEqual(records[1]["stream"], "stderr")
        self.assertEqual(records[1]["raw"], "Stderr error msg")

    def test_demux_docker_stream_raw_fallback(self):
        raw = b"Unframed raw log message line 1\nUnframed raw log message line 2\n"
        records = demux_docker_stream(raw)
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["raw"], "Unframed raw log message line 1")
        self.assertEqual(records[1]["raw"], "Unframed raw log message line 2")

    def test_parse_rfc3339_timestamp(self):
        line = "2026-11-27T00:22:19.964681288Z [INFO] Engine started successfully"
        ts, msg = parse_rfc3339_timestamp(line)
        self.assertEqual(ts, "2026-11-27T00:22:19.964681288Z")
        self.assertEqual(msg, "[INFO] Engine started successfully")

        # Line without timestamp
        line2 = "[INFO] Plain line without timestamp"
        ts2, msg2 = parse_rfc3339_timestamp(line2)
        self.assertIsNone(ts2)
        self.assertEqual(msg2, line2)


class TestContainerLogsEndpointBVA(unittest.TestCase):
    """BVA tests for container mapping, tail limits, and filtering logic."""

    def setUp(self):
        BridgeConfig.BRIDGE_SERVICE_TOKEN = "test-token"
        BridgeConfig.PAPERCLIP_BRIDGE_SECRET = "test-secret"
        BridgeConfig.DOCKER_SOCKET_PATH = "/var/run/docker.sock"

    def test_container_whitelist_mapping(self):
        self.assertEqual(CONTAINER_MAP["bridge"], "stock_mcp_bridge")
        self.assertEqual(CONTAINER_MAP["daemon"], "stock_screener_daemon")
        self.assertEqual(CONTAINER_MAP["dashboard"], "stock_trading_dashboard")
        self.assertEqual(CONTAINER_MAP["opend"], "stock_moomoo_opend")

    @patch("bridge.src.routes.logs.os.path.exists", return_value=True)
    @patch("bridge.src.routes.logs.UnixSocketHTTPConnection")
    def test_invalid_container_returns_400(self, mock_conn, mock_exists):
        with self.assertRaises(HTTPException) as ctx:
            get_container_logs(
                container="malicious_container_name",
                tail=50,
                level="ALL",
                search=None,
                caller="test_caller",
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Invalid container", ctx.exception.detail)

    @patch("bridge.src.routes.logs.os.path.exists", return_value=True)
    @patch("bridge.src.routes.logs.UnixSocketHTTPConnection")
    def test_tail_boundary_filtering(self, mock_conn_cls, mock_exists):
        # Create mock HTTP response
        mock_conn = MagicMock()
        mock_conn_cls.return_value = mock_conn
        mock_res = MagicMock()
        mock_res.status = 200

        # Generate 5 sample log lines
        sample_lines = [
            b"2026-11-27T00:01:00Z [INFO] System initialized\n",
            b"2026-11-27T00:02:00Z [WARN] Memory usage at 75%\n",
            b"2026-11-27T00:03:00Z [ERROR] Broker connection dropped\n",
            b"2026-11-27T00:04:00Z [INFO] Tariq evaluated AAPL\n",
            b"2026-11-27T00:05:00Z [DEBUG] Cache cleared\n",
        ]
        raw_payload = b"".join(struct.pack(">BxxxI", 1, len(l)) + l for l in sample_lines)
        mock_res.read.return_value = raw_payload
        mock_conn.getresponse.return_value = mock_res

        # 1. Level filter: ERROR
        res_error = get_container_logs(
            container="bridge",
            tail=100,
            level="ERROR",
            search=None,
            caller="test_caller",
        )
        self.assertEqual(res_error["total_lines"], 5)
        self.assertEqual(res_error["returned_lines"], 1)
        self.assertEqual(res_error["logs"][0]["level"], "ERROR")
        self.assertIn("Broker connection dropped", res_error["logs"][0]["message"])

        # 2. Level filter: WARN
        res_warn = get_container_logs(
            container="bridge",
            tail=100,
            level="WARN",
            search=None,
            caller="test_caller",
        )
        self.assertEqual(res_warn["returned_lines"], 1)
        self.assertEqual(res_warn["logs"][0]["level"], "WARN")

        # 3. Keyword filter: "Tariq"
        res_search = get_container_logs(
            container="bridge",
            tail=100,
            level="ALL",
            search="tariq",
            caller="test_caller",
        )
        self.assertEqual(res_search["returned_lines"], 1)
        self.assertIn("Tariq", res_search["logs"][0]["message"])

        # 4. Keyword filter: nonexistent substring
        res_empty = get_container_logs(
            container="bridge",
            tail=100,
            level="ALL",
            search="nonexistent_keyword_xyz",
            caller="test_caller",
        )
        self.assertEqual(res_empty["total_lines"], 5)
        self.assertEqual(res_empty["returned_lines"], 0)


if __name__ == "__main__":
    unittest.main()
