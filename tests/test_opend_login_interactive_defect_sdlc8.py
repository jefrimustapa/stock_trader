import asyncio
import os
import shutil
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from bridge.src.telnet_relay import TelnetRelayClient


class TestOpenDLoginInteractiveDefectSDLC8(unittest.TestCase):
    """
    Automated Defect & Regression Test Suite (SDLC #8) for HOM-173:
    Kecacatan:
    1. Sign-in ke Bridge memulangkan SUCCESS walaupun OpenD tidak pernah log masuk dan kekal di prompt WAIT_LOGIN.
    2. OpenD 10.12.7208 mengabaikan argumen CLI -login_account dan -login_pwd_md5 pada waktu mula, menyebabkan pendedahan hash MD5 dalam ps aux tanpa sebarang log masuk automatik.
    3. Kod lama tiada kaedah login interaktif telnet automatik untuk menyalurkan akaun, kata laluan, dan persetujuan simpan sesi (remember=Y).
    """

    def test_defect_1_login_interactive_method_missing_in_old_code(self):
        """
        Pengendalian Kecacatan Terlepas (SDLC #8):
        Kod lama TelnetRelayClient tiada kaedah login_interactive(account, password).
        Sebab test lama tidak nampak: Ujian lama hanya menguji relay_otp_code, check_status,
        dan logout_session dengan andaian OpenD boleh auto-login sendiri melalui argumen CLI.
        """
        client = TelnetRelayClient("127.0.0.1", 22222)
        self.assertTrue(
            hasattr(client, "login_interactive"),
            "TelnetRelayClient mesti mempunyai kaedah login_interactive(account, password)"
        )

    def test_bva_login_interactive_inputs(self):
        """
        BVA: Pengesahan nilai sempadan input untuk akaun dan kata laluan:
        - Akaun kosong atau whitespace -> Gagal (False, 'LOGIN_FAILED' / error)
        - Kata laluan kosong atau whitespace -> Gagal (False, 'LOGIN_FAILED' / error)
        """
        client = TelnetRelayClient("127.0.0.1", 22222)

        # Empty account
        status1, msg1 = asyncio.run(client.login_interactive("", "valid_password"))
        self.assertIn(status1, ["LOGIN_FAILED", "ERROR"])
        self.assertIn("cannot be empty", msg1.lower())

        # Whitespace account
        status2, msg2 = asyncio.run(client.login_interactive("   ", "valid_password"))
        self.assertIn(status2, ["LOGIN_FAILED", "ERROR"])
        self.assertIn("cannot be empty", msg2.lower())

        # Empty password
        status3, msg3 = asyncio.run(client.login_interactive("12345", ""))
        self.assertIn(status3, ["LOGIN_FAILED", "ERROR"])
        self.assertIn("cannot be empty", msg3.lower())

        # Whitespace password
        status4, msg4 = asyncio.run(client.login_interactive("12345", "   "))
        self.assertIn(status4, ["LOGIN_FAILED", "ERROR"])
        self.assertIn("cannot be empty", msg4.lower())

    def test_defect_2_entrypoint_must_not_pass_login_pwd_md5_to_opend(self):
        """
        Pengendalian Kecacatan Terlepas (SDLC #8):
        Kod lama entrypoint.sh memasukkan -login_pwd_md5=${PWD_MD5} ke dalam EXTRA_ARGS,
        mendedahkan hash MD5 dalam ps aux kontena.
        Sebab test lama tidak nampak: Tiada ujian mengesahkan skrip pelancaran kontena entrypoint.sh.
        """
        entrypoint_path = Path(__file__).parent.parent / "opend" / "scripts" / "entrypoint.sh"
        self.assertTrue(entrypoint_path.exists())
        content = entrypoint_path.read_text()
        self.assertNotIn(
            "-login_pwd_md5",
            content,
            "entrypoint.sh TIDAK BOLEH memasukkan -login_pwd_md5 dalam argumen CLI kerana membocorkan hash dalam senarai proses (ps)"
        )


if __name__ == "__main__":
    unittest.main()
