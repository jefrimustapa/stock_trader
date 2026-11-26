# Plan: HOM-392 Fix Paperclip Agent Heartbeat Spam & Dispatcher Throttling Cooldown

Branch: fix/hom-392-dispatcher-throttling-cooldown
Issue: HOM-392
Status: implementation complete (ready for QA review)

## 1. Goal & Acceptance Criteria
- Goal: Implement pure on-demand agent deliberation without artificial cooldown timers while preventing duplicate concurrent runs and loop spam.
- Acceptance Criteria 1: When user triggers analysis from UI, dispatcher executes on-demand wake immediately without timer cooldown.
- Acceptance Criteria 2: When an agent analysis is already in progress, duplicate concurrent triggers are safely rejected with in-flight status.
- Acceptance Criteria 3: When simulation runs with multiple candidates, Haziq is woken exactly once with all candidates batched together.
- Acceptance Criteria 4: Background 60-second monitoring loop evaluates positions locally via Exit Sentinel without invoking agent heartbeats.

## 2. Findings & Root Cause Analysis (RCA)
- **Clarification on Cooldown vs On-Demand**:
  - Artificial timer cooldown (e.g. 15m) is NOT needed for true on-demand usage.
  - The real requirement is: (1) stop the 60s background loop from calling agents, (2) batch candidates into 1 call, and (3) prevent concurrent duplicate runs while an analysis is in-flight.
- **Root Cause Summary**:
  - `bridge/src/main.py:44-63` invoked `run_simulation_cycle` every 60s in background.
  - `bridge/src/agent_pipeline.py:971-981` called `dispatcher.aggregate_and_wake_haziq()` inside per-candidate loop.
  - Result: 40+ concurrent full agent runs queued, exhausting Gemini quota.

## 3. Files to Modify
- `bridge/src/paperclip_dispatcher.py`: Replace cooldown timer with pure on-demand invocation and in-flight concurrency lock.
- `bridge/src/agent_pipeline.py`: Aggregate L1 evaluations into a single batch, wake Haziq once after loop, add `wake_agents` control.
- `bridge/src/main.py`: Set `wake_agents=False` for 60s background loop so local sentinel runs without agent wake.
- `bridge/src/routes/agents.py`: Ensure `/api/v1/agents/simulate-run` triggers on-demand deliberation with `wake_agents=True`.
- `tests/test_dispatcher_and_market_bva.py`: Unit and BVA tests for pure on-demand invocation, in-flight lock, and batching.
- `tests/test_agent_monitoring_exit_bva.py`: Integration tests verifying background monitoring never triggers remote agents.

## 4. Technical Approach
1. Enable pure on-demand agent execution: remove artificial cooldown timer restrictions.
2. In `PaperclipDispatcher`, implement in-flight tracking (`_is_running` flag / lock per agent) to prevent overlapping concurrent runs.
3. In `agent_pipeline.py`, move `aggregate_and_wake_haziq` outside the candidate loop to wake Haziq once per batch.
4. In `agent_pipeline.py`, set parameter `wake_agents: bool = False` by default for background cycles.
5. In `routes/agents.py`, `/api/v1/agents/simulate-run` sets `wake_agents=True` to execute on-demand deliberation.
6. In `main.py`, background monitoring loop runs with `wake_agents=False`.

## 5. Test Plan
- Boundary Value Analysis (BVA):
  - On-Demand immediate execution: User trigger immediately invokes agent heartbeat.
  - In-flight lock: Triggering while agent is currently running returns `IN_PROGRESS_SKIPPED`.
  - Sequential execution: User trigger immediately after previous run finishes executes SUCCESS.
  - Candidate batching: 10 candidates trigger exactly 1 aggregated Haziq wake call.
- E2E User Scenario:
  - Background 60s loop runs: Exit Sentinel evaluates, zero agent heartbeats sent.
  - User triggers on-demand: Tariq, Nawwar, Haziq, Danial execute once in batched sequence.

## 6. Risks & Non-Goals
- Risk: None. Removing artificial cooldown gives full on-demand control to user while in-flight lock prevents duplicate runaway calls.
- Non-Goal: Modifying Paperclip server infrastructure or changing Gemini model quota tiers.
