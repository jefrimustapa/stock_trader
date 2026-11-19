import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import BridgeConfig
from .reconciliation import PositionReconciler
from .moomoo_client import get_moomoo_client
from .routes import health, trade, telnet, kline, agents, market

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [BridgeL4] %(message)s"
)
logger = logging.getLogger(__name__)

reconciler = PositionReconciler(
    status_file=BridgeConfig.SENTINEL_STATUS_PATH,
    check_interval=60,
    heartbeat_interval=5
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager: validates credentials, starts background reconciliation and sentinel heartbeat."""
    logger.info("Validating Bridge L4 configuration and secrets...")
    BridgeConfig.validate_secrets()
    BridgeConfig.ensure_data_dir()

    logger.info("Initializing Bridge L4 background services...")
    reconciler.start()

    async def run_kline_cleanup_loop():
        moomoo_client = get_moomoo_client()
        while True:
            try:
                moomoo_client.subscription_manager.cleanup_expired_subscriptions()
            except Exception as e:
                logger.error("K-line subscription cleanup loop error: %s", e)
            await asyncio.sleep(15)

    async def run_agent_pipeline_loop():
        from .agent_pipeline import get_agent_pipeline
        await asyncio.sleep(5)
        pipeline = get_agent_pipeline()
        while True:
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(
                    None,
                    lambda: pipeline.run_simulation_cycle(force_simulation=True, mock_market_window=True)
                )
            except Exception as e:
                logger.error("Periodic agent simulation cycle error: %s", e)
            await asyncio.sleep(60)

    heartbeat_task = asyncio.create_task(reconciler.run_heartbeat_loop())
    reconcile_task = asyncio.create_task(reconciler.run_reconciliation_loop())
    kline_cleanup_task = asyncio.create_task(run_kline_cleanup_loop())
    agent_pipeline_task = asyncio.create_task(run_agent_pipeline_loop())

    logger.info("Bridge L4 Service ready on port 8000.")
    yield

    logger.info("Shutting down Bridge L4 Service...")
    reconciler.stop()
    heartbeat_task.cancel()
    reconcile_task.cancel()
    kline_cleanup_task.cancel()
    agent_pipeline_task.cancel()
    try:
        await asyncio.gather(heartbeat_task, reconcile_task, kline_cleanup_task, agent_pipeline_task, return_exceptions=True)
    except Exception:
        pass
    logger.info("Bridge L4 Service shutdown complete.")


app = FastAPI(
    title="US Stock Analyst & Trader - REST Bridge L4",
    version="1.0.0",
    description="Deterministic REST Bridge enforcing 8 Hard Rules and relaying commands to OpenD",
    lifespan=lifespan
)

# Secure CORS configuration: Restrict to explicit origins without permissive wildcard credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://stock-trader.beta.julietmike.net"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(trade.router)
app.include_router(telnet.router)
app.include_router(kline.router)
app.include_router(agents.router)
app.include_router(market.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=False)
