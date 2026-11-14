import unittest
from unittest.mock import MagicMock, patch
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from bridge.src.moomoo_client import MoomooClient


class MockDataFrame:
    def __init__(self, data=None):
        self.data = data or []
        self.empty = len(self.data) == 0
        self.columns = list(self.data[0].keys()) if self.data else []

    def iterrows(self):
        for idx, row in enumerate(self.data):
            yield idx, row

    def __getitem__(self, key):
        return self

    def __eq__(self, other):
        return self

    def iloc(self, idx):
        return self.data[idx]

    @property
    def iloc(self):
        class ILoc:
            def __init__(self, data):
                self._data = data
            def __getitem__(self, idx):
                return self._data[idx]
        return ILoc(self.data)

    def get(self, key, default=None):
        if self.data and key in self.data[0]:
            class Series:
                def __init__(self, val):
                    self.iloc = [val]
            return Series(self.data[0][key])
        return default


class TestMoomooEncryptionStatusDefectSDLC8(unittest.TestCase):
    """
    SDLC #8: Pengendalian Kecacatan Terlepas (HOM-175).
    Ujian ini MESTI GAGAL pada kod lama kerana:
    1. Apabila OpenD disambungkan tetapi get_acc_list() mengembalikan ralat -1
       (contoh: 'To ensure trading security, cross-network trade connections must be encrypted...'),
       kod lama menetapkan status kepada WAIT_LOGIN secara senyap dan menelan ralat tersebut.
    2. Apabila OpenD siap login tetapi accinfo_query gagal, get_connection_status() memulangkan WAIT_LOGIN.
    3. OpenSecTradeContext dimulakan dengan is_encrypt=False secara tegar.

    Kenapa test lama tidak nampak:
    Ujian lama hanya menyemak keadaan login berjaya (RET_OK) atau kegagalan socket terputus
    (ConnectionRefusedError -> DISCONNECTED), tanpa menguji laluan kegagalan API dagangan
    (ret_code == -1) semasa status konteks READY.
    """

    def setUp(self):
        self.client = MoomooClient(host="127.0.0.1", port=11111, trd_env="SIMULATE")

    def test_defect_get_acc_list_error_must_report_connect_error_not_wait_login(self):
        """
        Kecacatan 1: Apabila get_acc_list mengembalikan kod -1 (contohnya ralat enkripsi rentas rangkaian),
        status tidak boleh kekal WAIT_LOGIN, sebaliknya mesti CONNECT_ERROR dengan mesej ralat disimpan.
        """
        mock_ctx = MagicMock()
        mock_ctx._status = 3  # ContextStatus.READY
        mock_ctx.get_acc_list.return_value = (
            -1,
            "To ensure trading security, cross-network trade connections must be encrypted."
        )

        with patch("socket.create_connection", return_value=MagicMock()), \
             patch("bridge.src.moomoo_client.OpenSecTradeContext", return_value=mock_ctx), \
             patch("bridge.src.moomoo_client.TrdEnv", MagicMock()), \
             patch("bridge.src.moomoo_client.TrdMarket", MagicMock()), \
             patch("bridge.src.moomoo_client.ContextStatus") as mock_status:
            mock_status.READY = 3

            connected = self.client.connect()

            self.assertFalse(connected)
            status = self.client.get_connection_status()
            # Pada kod lama, status memulangkan "WAIT_LOGIN"
            self.assertNotEqual(
                status,
                "WAIT_LOGIN",
                "GAGAL: Status masih dilaporkan sebagai WAIT_LOGIN walaupun ralat API get_acc_list(-1) berlaku!"
            )
            self.assertEqual(status, "CONNECT_ERROR")

            acc_info = self.client.get_account_info()
            self.assertEqual(acc_info.get("status"), "CONNECT_ERROR")
            self.assertIn("cross-network trade connections must be encrypted", str(acc_info.get("error_message", "")))

    def test_defect_accinfo_query_error_must_report_connect_error_not_wait_login(self):
        """
        Kecacatan 2: Apabila get_acc_list berjaya tetapi accinfo_query gagal (-1),
        status mesti CONNECT_ERROR bukan WAIT_LOGIN.
        """
        mock_ctx = MagicMock()
        mock_ctx._status = 3
        df_acc = MockDataFrame([{
            "acc_id": "10001",
            "trd_env": "SIMULATE",
            "sim_acc_type": "STOCK",
            "card_num": "CARD1"
        }])
        mock_ctx.get_acc_list.return_value = (0, df_acc)
        mock_ctx.accinfo_query.return_value = (-1, "Account query failed")

        with patch("socket.create_connection", return_value=MagicMock()), \
             patch("bridge.src.moomoo_client.OpenSecTradeContext", return_value=mock_ctx), \
             patch("bridge.src.moomoo_client.TrdEnv", MagicMock()), \
             patch("bridge.src.moomoo_client.TrdMarket", MagicMock()), \
             patch("bridge.src.moomoo_client.ContextStatus") as mock_status:
            mock_status.READY = 3

            connected = self.client.connect()

            self.assertFalse(connected)
            status = self.client.get_connection_status()
            self.assertNotEqual(
                status,
                "WAIT_LOGIN",
                "GAGAL: Status masih dilaporkan sebagai WAIT_LOGIN apabila accinfo_query gagal!"
            )
            self.assertEqual(status, "CONNECT_ERROR")

    def test_defect_trade_context_uses_encryption_when_configured(self):
        """
        Kecacatan 3: Kod lama hardcoded is_encrypt=False.
        Kod baharu mesti menggunakan enkripsi proto RSA (is_encrypt=True) apabila diaktifkan/dikonfigurasikan.
        """
        mock_ctx_class = MagicMock()
        mock_ctx = MagicMock()
        mock_ctx._status = 3
        mock_ctx.get_acc_list.return_value = (-1, "encryption required")
        mock_ctx_class.return_value = mock_ctx

        with patch("socket.create_connection", return_value=MagicMock()), \
             patch("bridge.src.moomoo_client.OpenSecTradeContext", mock_ctx_class), \
             patch("bridge.src.moomoo_client.TrdEnv", MagicMock()), \
             patch("bridge.src.moomoo_client.TrdMarket", MagicMock()), \
             patch("bridge.src.moomoo_client.ContextStatus") as mock_status:
            mock_status.READY = 3

            # Enable encryption
            self.client.is_encrypt = True
            self.client.connect()

            _, kwargs = mock_ctx_class.call_args
            self.assertTrue(
                kwargs.get("is_encrypt"),
                "GAGAL: OpenSecTradeContext masih dipanggil dengan is_encrypt=False!"
            )


if __name__ == "__main__":
    unittest.main()
