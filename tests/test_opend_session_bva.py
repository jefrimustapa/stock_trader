import json
import os
import shutil
import stat
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from bridge.src.moomoo_client import MoomooClient


class TestOpenDSessionBVA(unittest.TestCase):
    """
    Automated defect and BVA tests for Seksyen 3.5.B Blueprint OpenD session management:
    1. Dynamic switching of acc_id (Paper Trading 1/2) via SDK without container restart.
    2. Session sign-out: Telnet logout + token cleanup + idle mode restart.
    3. Switching login account: Sign-out + config update + OpenD restart.
    """

    def setUp(self):
        self.temp_session_dir = Path(tempfile.mkdtemp())
        self.client = MoomooClient(host="127.0.0.1", port=11111, trd_env="SIMULATE")

    def tearDown(self):
        if self.temp_session_dir.exists():
            shutil.rmtree(self.temp_session_dir)

    def test_defect_switch_account_missing_in_old_code(self):
        """
        Pengendalian Kecacatan Terlepas (SDLC #8):
        Kod lama tiada kaedah switch_account dan get_accounts pada MoomooClient.
        Sebab test lama tidak nampak: Ujian lama hanya menguji connect() dan get_account_info()
        dengan andaian akaun adalah tunggal (single account) tanpa menguji pertukaran acc_id.
        """
        self.assertTrue(
            hasattr(self.client, "switch_account"),
            "MoomooClient mesti mempunyai kaedah switch_account(account_id)"
        )
        self.assertTrue(
            hasattr(self.client, "get_accounts"),
            "MoomooClient mesti mempunyai kaedah get_accounts()"
        )

    def test_bva_switch_account_empty(self):
        """BVA: Empty and whitespace account IDs must be rejected."""
        self.client._connected = True
        self.client._account_id = "1001"
        success, msg = self.client.switch_account("")
        self.assertFalse(success)
        self.assertIn("cannot be empty", msg)

        success2, msg2 = self.client.switch_account("   ")
        self.assertFalse(success2)
        self.assertIn("cannot be empty", msg2)

    def test_switch_account_success_without_restart(self):
        """Switching acc_id updates active account and equity dynamically without restarting container."""
        from unittest.mock import patch, MagicMock

        self.client._connected = True
        self.client._account_id = "1001"
        self.client._cash_balance = 50000.0
        self.client._total_equity = 100000.0
        self.client._available_accounts = [
            {"account_id": "1001", "trd_env": "SIMULATE", "sim_acc_type": "Stock", "card_num": "C1001"},
            {"account_id": "1002", "trd_env": "SIMULATE", "sim_acc_type": "Stock", "card_num": "C1002"}
        ]

        mock_ctx = MagicMock()
        mock_ctx.accinfo_query.return_value = (0, None)
        with patch("bridge.src.moomoo_client.OpenSecTradeContext", return_value=mock_ctx), \
             patch("bridge.src.moomoo_client.TrdEnv", MagicMock()), \
             patch("bridge.src.moomoo_client.TrdMarket", MagicMock()):
            success, msg = self.client.switch_account("1002")
            self.assertTrue(success)
            self.assertEqual(self.client._account_id, "1002")
            self.assertIn("1002", msg)

    def test_defect_sign_out_cleans_token_data_and_sets_idle(self):
        """
        Pengendalian Kecacatan Terlepas (SDLC #8):
        Kod lama /sign-out hanya menghantar telnet logout tanpa membersihkan fail token
        dalam opend_session_data dan tanpa meletakkan OpenD dalam mod idle.
        Sebab test lama tidak nampak: Ujian telnet hanya mengesahkan teks respons 'logout'
        tanpa mengesahkan integriti fail sesi atau mod kontena.
        """
        from bridge.src.opend_manager import OpenDManager

        # Create dummy session files in temp opend_session_data
        token_file = self.temp_session_dir / "session_token.dat"
        token_file.write_text("dummy-session-token-secret")
        f3cnn_dir = self.temp_session_dir / "F3CNN"
        f3cnn_dir.mkdir()
        (f3cnn_dir / "cache.bin").write_text("binary-data")

        manager = OpenDManager(session_dir=self.temp_session_dir, container_name="mock_opend")
        result = manager.clean_session_data()

        self.assertTrue(result)
        self.assertFalse(token_file.exists(), "Session token file mesti dibersihkan")
        self.assertFalse(f3cnn_dir.exists(), "Folder F3CNN mesti dibersihkan")

        # Set idle mode
        manager.set_idle_mode(True)
        idle_flag = self.temp_session_dir / ".idle_mode"
        self.assertTrue(idle_flag.exists(), ".idle_mode mesti diwujudkan selepas sign-out")

    def test_defect_switch_login_account_updates_config(self):
        """
        Pengendalian Kecacatan Terlepas (SDLC #8):
        Kod lama tiada pengendalian pertukaran akaun log masuk OpenD.
        Sebab test lama tidak nampak: Sistem diuji dengan satu set pemboleh ubah persekitaran statik.
        """
        from bridge.src.opend_manager import OpenDManager

        manager = OpenDManager(session_dir=self.temp_session_dir, container_name="mock_opend")
        # Ensure idle mode is active first
        manager.set_idle_mode(True)
        self.assertTrue((self.temp_session_dir / ".idle_mode").exists())

        # Update login config with valid 32-hex MD5
        valid_md5 = "5f4dcc3b5aa765d61d8327deb882cf99"
        success, msg = manager.update_login_config(login_account="98765432", login_pwd_md5=valid_md5)
        self.assertTrue(success)

        # .idle_mode must be cleared so OpenD boots with new account
        self.assertFalse((self.temp_session_dir / ".idle_mode").exists())

        config_file = self.temp_session_dir / "opend_login.json"
        self.assertTrue(config_file.exists())
        self.assertEqual(stat.S_IMODE(os.stat(config_file).st_mode), 0o600, "opend_login.json mesti 0600")
        with open(config_file, "r") as f:
            cfg = json.load(f)
        self.assertEqual(cfg["login_account"], "98765432")
        self.assertEqual(cfg["login_pwd_md5"], valid_md5)


if __name__ == "__main__":
    unittest.main()
