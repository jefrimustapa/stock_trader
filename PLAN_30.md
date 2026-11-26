# Plan: Connect Trader Agent Active Monitoring and Auto-Exit Sentinel (#30)

Branch: `fix/hom-384-agent-monitoring`
Issue: `https://github.com/jefrimustapa/stock_trader/issues/30`
Status: `waiting for go (implementation NOT started)`

## 1. Goal & Acceptance Criteria
- **Goal**: Enable automated portfolio exit execution (selling) and connect Paperclip heartbeat triggers so trader agents monitor stocks actively.
- **User Acceptance Criteria**:
  - When active positions hit Stop Loss, Take Profit (TP1 50%), or Trailing Stop, system automatically executes SELL orders.
  - When simulation/monitoring cycles run, system invokes Paperclip agent heartbeats for Tariq, Nawwar, Haziq, and Danial at crew.julietmike.net.
  - Active portfolio holdings are evaluated during the regular monitoring cycle.

## 2. Findings / Root Cause
- **Uncalled Exit Sentinel (`bridge/src/agent_pipeline.py:1320`)**:
  - `evaluate_portfolio_positions()` defines automated exit logic (Stop Loss, TP1, Chandelier Trailing Stop).
  - It is never called in the background service loop, preventing automatic portfolio sales.
- **Periodic Loop Missing Exit & Active Positions (`bridge/src/main.py:46-58`)**:
  - `run_agent_pipeline_loop` only calls `run_simulation_cycle(force_simulation=True, mock_market_window=True)`.
  - It omits `evaluate_portfolio_positions()` and runs with `include_active_positions=False`.
- **Disconnected Dispatcher (`bridge/src/paperclip_dispatcher.py`)**:
  - `PaperclipDispatcher` exists and is unit-tested, but is not called from `agent_pipeline.py`.
  - No heartbeat wake calls (`POST /api/agents/:agentId/heartbeat/invoke`) are sent to crew.julietmike.net.

## 3. User Review Required
- Dispatcher trigger frequency: Should agent heartbeats trigger on every 60s cycle or only when qualifying candidates or exit events occur? (Recommended: Trigger on qualifying candidates and exit signals to manage token and API overhead).

## 4. Proposed Changes
- `[MODIFY] bridge/src/main.py`:
  - Call `pipeline.evaluate_portfolio_positions()` inside the periodic background loop.
  - Pass `include_active_positions=True` in `run_simulation_cycle`.
- `[MODIFY] bridge/src/agent_pipeline.py`:
  - Initialize and invoke `PaperclipDispatcher` during cycle execution to wake L1, L2, and L3 agents on Paperclip.
- `[NEW] tests/test_agent_monitoring_exit_bva.py`:
  - BVA test cases for exit sentinel thresholds and heartbeat invocation error handling.

## 5. Explicitly NOT Changing
- Hard Rules risk limits in Danial audit engine.
- Moomoo OpenD protocol or live trading broker credentials.

## 6. Verification Plan
- **BVA & Unit Tests**: Test SL, TP1, and trailing stop sell order generation (<15 min).
- **Dispatcher Tests**: Test heartbeat invocation with mocked and real Paperclip endpoints.
- **E2E Simulation**: Run full cycle with open positions to verify automated sell order placement.
