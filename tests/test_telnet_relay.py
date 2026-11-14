import asyncio
import unittest
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from bridge.src.telnet_relay import TelnetRelayClient


class MockTelnetServer:
    def __init__(self, host="127.0.0.1", port=0):
        self.host = host
        self.port = port
        self.server = None
        self.last_received = None

    async def handle_client(self, reader, writer):
        writer.write(b"OpenD 10.12 Telnet Ready\r\n")
        await writer.drain()

        data = await reader.read(1024)
        self.last_received = data.decode(errors="ignore").strip()

        if "input_phone_verify_code" in self.last_received:
            writer.write(b"RET_OK: OTP Accepted\r\n")
        elif "logout" in self.last_received:
            writer.write(b"RET_OK: Session Terminated\r\n")
        else:
            writer.write(b"ERR_UNKNOWN\r\n")
        await writer.drain()
        writer.close()
        await writer.wait_closed()

    async def start(self):
        self.server = await asyncio.start_server(self.handle_client, self.host, self.port)
        self.port = self.server.sockets[0].getsockname()[1]

    async def stop(self):
        if self.server:
            self.server.close()
            await self.server.wait_closed()


class TestTelnetRelay(unittest.IsolatedAsyncioTestCase):
    """
    Tests asynchronous Telnet relay to OpenD port 22222.
    """

    async def asyncSetUp(self):
        self.mock_server = MockTelnetServer()
        await self.mock_server.start()
        self.client = TelnetRelayClient("127.0.0.1", self.mock_server.port)

    async def asyncTearDown(self):
        await self.mock_server.stop()

    async def test_relay_otp_code(self):
        success, response = await self.client.relay_otp_code("654321")
        self.assertTrue(success)
        self.assertIn("RET_OK: OTP Accepted", response)
        self.assertEqual(self.mock_server.last_received, "input_phone_verify_code -code=654321")

    async def test_relay_empty_otp_rejected(self):
        success, response = await self.client.relay_otp_code("")
        self.assertFalse(success)
        self.assertIn("cannot be empty", response)

    async def test_logout_session(self):
        success, response = await self.client.logout_session()
        self.assertTrue(success)
        self.assertIn("RET_OK: Session Terminated", response)
        self.assertEqual(self.mock_server.last_received, "logout")


if __name__ == "__main__":
    unittest.main()
