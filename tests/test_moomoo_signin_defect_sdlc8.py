import hashlib
import json
import os
import shutil
import stat
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from bridge.src.opend_manager import OpenDManager
from bridge.src.moomoo_client import MoomooClient


class TestMoomooSignInDefectSDLC8(unittest.TestCase):
    """
    Automated Defect & Regression Test Suite (SDLC #8) for HOM-165:
    Kecacatan yang dikesan Hakeem pasca-HOM-164:
    1. Borang tukar akaun/sign-in tiada medan kata laluan dan tiada hashing MD5 selamat.
    2. OpenD kekal WAIT_LOGIN selepas Sign-Out kerana token dibersihkan dan tiada aliran sign-in dengan kata laluan.
    3. Status OpenD tidak membezakan antara IDLE/SIGNED_OUT, WAIT_LOGIN, WAIT_OTP, dan CONNECTED.
    4. Fail opend_login.json mesti dilindungi dengan mod kebenaran fail ketat (chmod 0600) untuk mengelakkan pendedahan hash kepada pengguna lain.
    """

    def setUp(self):
        self.temp_session_dir = Path(tempfile.mkdtemp())
        self.manager = OpenDManager(session_dir=self.temp_session_dir, container_name="mock_opend")
        self.client = MoomooClient(host="127.0.0.1", port=11111, trd_env="SIMULATE")

    def tearDown(self):
        if self.temp_session_dir.exists():
            shutil.rmtree(self.temp_session_dir)

    def test_defect_1_opend_login_config_strict_file_permissions(self):
        """
        Kecacatan: Kod lama menulis opend_login.json dengan umask lalai (cth 0644),
        membenarkan pengguna lain membaca hash MD5.
        Sebab test lama tidak nampak: Ujian lama hanya mengesahkan kewujudan fail dan isi JSON
        tanpa memeriksa bit kebenaran fail (file mode).
        """
        success, msg = self.manager.update_login_config(
            login_account="12345678",
            login_pwd_md5="098f6bcd4621d373cade4e832627b4f6"
        )
        self.assertTrue(success)
        config_path = self.temp_session_dir / "opend_login.json"
        self.assertTrue(config_path.exists())

        # Check permissions: must be exactly 0600 (read/write only by owner)
        file_stat = os.stat(config_path)
        file_mode = stat.S_IMODE(file_stat.st_mode)
        self.assertEqual(
            file_mode,
            0o600,
            f"Kebenaran fail opend_login.json mestilah 0600, tetapi didapati {oct(file_mode)}"
        )

    def test_defect_2_status_reports_idle_when_idle_mode_active(self):
        """
        Kecacatan: Selepas sign-out, OpenD dimatikan sesi dan .idle_mode dicipta.
        Namun MoomooClient.get_connection_status() dalam kod lama masih memulangkan WAIT_LOGIN
        atau DISCONNECTED tanpa membezakan keadaan IDLE / SIGNED_OUT.
        Sebab test lama tidak nampak: Ujian lama hanya menyemak kewujudan fail .idle_mode
        tanpa memanggil status resolver pada MoomooClient.
        """
        self.manager.set_idle_mode(True)
        # Mock MoomooClient injected with manager
        self.client.set_opend_manager(self.manager)
        status = self.client.get_connection_status()
        self.assertIn(
            status,
            ["IDLE", "SIGNED_OUT"],
            f"Status sepatutnya IDLE atau SIGNED_OUT bila .idle_mode aktif, tetapi dapat {status}"
        )

    def test_bva_login_config_inputs(self):
        """
        BVA: Pengesahan nilai sempadan untuk akaun dan MD5 password hash:
        - Akaun kosong atau whitespace -> Gagal (False)
        - MD5 kosong atau whitespace -> Gagal jika tiada token sesi
        - Format MD5 tidak sah (bukan 32 hex karakter) -> Gagal (False)
        """
        # Empty account
        s1, m1 = self.manager.update_login_config("", "098f6bcd4621d373cade4e832627b4f6")
        self.assertFalse(s1)
        self.assertIn("cannot be empty", m1)

        # Whitespace account
        s2, m2 = self.manager.update_login_config("   ", "098f6bcd4621d373cade4e832627b4f6")
        self.assertFalse(s2)
        self.assertIn("cannot be empty", m2)

        # Invalid MD5 format (not 32 hex characters)
        s3, m3 = self.manager.update_login_config("12345", "not-a-valid-md5")
        self.assertFalse(s3)
        self.assertIn("MD5", m3)


if __name__ == "__main__":
    unittest.main()
