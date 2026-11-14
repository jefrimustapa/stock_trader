import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from bridge.src.moomoo_client import MoomooClient


class TestMoomooFailClosedDefectSDLC8(unittest.TestCase):
    """
    SDLC #8: Pengendalian Kecacatan Terlepas (HOM-167 QA conditional rejection).
    Ujian ini MESTI GAGAL pada kod lama (commit 80bc3a7) kerana kod lama:
    1. submit_order() memulangkan status 'ACCEPTED_LOCAL_MOCK' dan order_id 'MOCK-ORD-...'
       secara senyap apabila _connected=False.
    2. switch_account() membenarkan penetapan akaun secara senyap ('Switched to account ...')
       melalui fallback mock/test apabila SDK tiada atau OpenD terputus.

    Kenapa test lama tidak nampak kecacatan ini:
    Test lama (test_moomoo_client_bva.py:test_submit_order_when_disconnected_generates_mock)
    secara silap mengesahkan bahawa 'ACCEPTED_LOCAL_MOCK' adalah tingkah laku yang diterima,
    bukannya menguatkuasakan fail-closed HTTP 503 / REJECTED tanpa mock senyap.
    """

    def setUp(self):
        self.client = MoomooClient(host="127.0.0.1", port=59999, trd_env="SIMULATE")
        self.client._connected = False

    def test_defect_submit_order_when_disconnected_must_reject_not_mock_accept(self):
        """
        Kecacatan 1: submit_order() pada kod lama memulangkan ACCEPTED_LOCAL_MOCK.
        Kod baharu MESTI memulangkan status='REJECTED' dan order_id=None (tiada MOCK-ORD).
        """
        res = self.client.submit_order({"client_order_id": "test-order-failclosed-1"})

        # Kod lama memulangkan ACCEPTED_LOCAL_MOCK -> ini akan GAGAL pada kod lama
        self.assertNotEqual(
            res.get("status"),
            "ACCEPTED_LOCAL_MOCK",
            "GAGAL: submit_order() masih memulangkan ACCEPTED_LOCAL_MOCK secara senyap tanpa broker!"
        )
        self.assertEqual(
            res.get("status"),
            "REJECTED",
            f"Expected status REJECTED, but got {res.get('status')}"
        )
        self.assertIsNone(
            res.get("order_id"),
            f"order_id mesti None apabila ditolak, bukan '{res.get('order_id')}'"
        )
        self.assertIn(
            "error",
            res,
            "Respons mesti mengandungi mesej ralat kegagalan gateway"
        )

    def test_defect_switch_account_when_disconnected_must_fail_closed(self):
        """
        Kecacatan 2: switch_account() pada kod lama mempunyai fallback mock/test
        yang menetapkan _account_id dan memulangkan True walaupun terputus.
        """
        # Sediakan senarai akaun tetapi keadaan terputus
        self.client._connected = False
        self.client._available_accounts = [{"account_id": "999888", "account_type": "MARGIN"}]
        self.client._account_id = "111222"

        success, msg = self.client.switch_account("999888")

        # Kod baharu MESTI fail-closed: tidak boleh tukar akaun jika terputus
        self.assertFalse(
            success,
            "GAGAL: switch_account() membenarkan pertukaran akaun semasa OpenD terputus!"
        )
        self.assertNotEqual(
            self.client._account_id,
            "999888",
            "GAGAL: _account_id ditukar secara senyap semasa terputus!"
        )

    def test_defect_switch_account_without_sdk_must_fail_closed(self):
        """
        Kecacatan 3: switch_account() pada kod lama mempunyai fallback L286-288:
        self._account_id = clean_id; return True.
        Ujian ini mengesahkan ketiadaan fallback mock tersebut.
        """
        from unittest.mock import patch

        self.client._connected = True
        self.client._account_id = "INITIAL_ACC"

        # Simulasikan ketiadaan OpenSecTradeContext (None)
        with patch("bridge.src.moomoo_client.OpenSecTradeContext", None):
            success, msg = self.client.switch_account("NEW_MOCK_ACC")

            # Kod lama memulangkan True dan menukar akaun -> ini akan GAGAL pada kod lama
            self.assertFalse(
                success,
                "GAGAL: switch_account() membenarkan fallback mock/test tanpa SDK!"
            )
            self.assertNotEqual(
                self.client._account_id,
                "NEW_MOCK_ACC",
                "GAGAL: _account_id ditukar oleh fallback mock!"
            )


if __name__ == "__main__":
    unittest.main()
