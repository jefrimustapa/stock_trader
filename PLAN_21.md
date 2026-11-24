# Plan: Translate UI to Concise Simple English

Branch: feat/hom-364-translate-ui-english
Issue: https://github.com/jefrimustapa/stock_trader/issues/21
Status: QA remediation completed, ready for QA Gate re-audit

## QA Defect Resolution (HOM-372 Follow-Up)
1. **SettingsPage.jsx**:
   - Fixed validation messages: `Value cannot be empty.`, `Minimum market cap cannot exceed $10,000,000,000,000 ($10T).`, `Minimum RVOL cannot exceed maximum RVOL.`
   - Fixed Agent Pagination Guidance card title.
   - Fixed Trading Mode Tab 1 bullets: `Close: Mandatory square-off at 15:45 NY (No overnight holding)`, `Monitoring Interval: 4H / Daily Cycle (09:00, 13:00, 16:30 NY) + 1H adaptive check`, `Holding: Multi-day holding allowed with trailing stop`.
   - Fixed Broker Account Air Gap Protection card header.
   - Fixed SQLite WAL Configuration Modification History card title and `No configuration changes recorded yet.`
   - Fixed $1.00 mandatory floor price callout.
2. **WatchlistTable.jsx**:
   - Fixed table headers: `Symbol`, `Price`, `Change %`, `52W High Dist`.
   - Fixed tooltips: `20-Day Average Daily Volume`, `15-Minute Relative Volume (> 1.0x = Unusual Volume)`.
3. **AgentsPage.jsx**:
   - Fixed header: `L1 -> L4: Agent Team Activity`, `Agent Decision Pipeline`.
   - Fixed Cycle chip and pipeline flow header.
   - Fixed deliberation cards: `TP1 Target (1:1.5 R:R)`, `Effective Capital Base`, `8 Hard Rules Check (Risk Audit Matrix):`.
   - Fixed simulation empty state and order table title.
   - Fixed order table headers: `SYMBOL`, `SIDE`, `QUANTITY`, `TIMESTAMP`, `ACTION`.
4. **PortfolioPage.jsx**:
   - Fixed tooltips: `Source: Agent Pipeline`, `Source: OpenD Broker Order Import`, `Source: Automatic OpenD Position Reconciliation`.
   - Fixed source chips: `Agent`, `Broker / Manual`, `Reconciliation`.
5. **KlineDrawer.jsx**:
   - Fixed buttons and tooltips: `All`, `Zoom In (+)`, `Zoom Out (-)`.
6. **L0Page.jsx**:
   - Fixed funnel comment.


## 1. Goal & Acceptance Criteria
- Goal: Eliminate mixed Malay and English UI text across the entire dashboard and unify all user-facing copy into concise, plain English following ASD-STE100 standards.
- Acceptance Criteria:
  - When user opens any page (Overview, Funnel, Watchlist, Portfolio, Quota, Agents, L0, Settings, OpenD), all headers, labels, buttons, and badges display clear English.
  - When user triggers modals, toasts, tooltips, and table pagination, all messages show clear English text.
  - When user interacts with form inputs and error boundaries, error messages and placeholders display plain English.
  - Technical parameters, API contracts, database fields, and trading identifiers remain unchanged.

## 2. Files to Modify
- `dashboard/index.html`: Update HTML lang attribute to "en" and translate test scaffold button label.
- `dashboard/src/App.jsx`: Translate page route headers and fallback error displays.
- `dashboard/src/components/Layout.jsx`: Translate navigation items, sidebar labels, user tooltips, and footer copy.
- `dashboard/src/components/OpendControlPanel.jsx`: Translate connection status, account switcher, login forms, OTP dialogs, and alerts.
- `dashboard/src/components/WatchlistTable.jsx`: Translate table column headers, filter chips, tooltips, mobile scroll hints, and empty state messages.
- `dashboard/src/components/ErrorBoundary.jsx`: Translate crash recovery message and reset button.
- `dashboard/src/components/FunnelStepper.jsx`: Translate funnel step names, descriptions, criteria labels, and step guidance.
- `dashboard/src/components/KpiCards.jsx`: Translate KPI metric titles, subtext labels, and status badges.
- `dashboard/src/components/KlineDrawer.jsx`: Translate chart interval options, technical indicators, drawer tabs, and loading states.
- `dashboard/src/pages/OverviewPage.jsx`: Translate overview section titles, shortcut cards, and system status summaries.
- `dashboard/src/pages/SettingsPage.jsx`: Translate settings tabs, input labels, validation error messages, helper text, and save confirmations.
- `dashboard/src/pages/WatchlistPage.jsx`: Translate watchlist header, tab labels, and metrics explanation banner.
- `dashboard/src/pages/OpendPage.jsx`: Translate OpenD management page header, instructions, and architecture cards.
- `dashboard/src/pages/PortfolioPage.jsx`: Translate portfolio metrics, position status labels, and empty states.
- `dashboard/src/pages/FunnelPage.jsx`: Translate funnel page header, workflow banner, and stage descriptions.
- `dashboard/src/pages/QuotaPage.jsx`: Translate API quota metrics, table column titles, expiration badges, and warning banners.
- `dashboard/src/pages/AgentsPage.jsx`: Translate agent deliberative logs, news sentiment cards, order history table, and pause toggle banner.
- `dashboard/src/pages/L0Page.jsx`: Translate L0 raw universe filtering metrics, column headers, and audit trail labels.
- `dashboard/src/utils/formatters.js`: Translate fallback status text (e.g. loading messages and stage descriptions).
- `dashboard/test_*.js`: Update string-matching assertions in regression test files to match concise English strings.

## 3. Technical Approach
1. Audit all user-facing strings across `dashboard/src/` and `dashboard/index.html` to catalog Malay and mixed phrases.
2. Formulate concise English translations following ASD-STE100 principles (short sentences, active voice, direct verbs).
3. Update components and pages sequentially without modifying any backend API payload keys or state machine values.
4. Update `dashboard/src/utils/formatters.js` loading and fallback strings.
5. Update unit and QC test assertions that check for translated UI strings.
6. Verify local test suites (`npm test`, `npm run test:qc`, `node test_screener_config.js`, `node test_kline_quota_api.js`, `node test_trading_mode_api.js`).
7. Run E2E verification using `playwright-browser` container.
8. Deploy to beta preview (`https://stock-trader-beta.julietmike.net`) and conduct visual checks.
- Rejected alternative: Introducing an i18n runtime library (e.g., react-i18next). Rejected because single-language unified English is required; an added library increases bundle size and runtime complexity unnecessarily.

## 4. Test Plan
- Boundary Value Analysis (BVA):
  - Form validation error messages in SettingsPage (zero, negative, max limits, empty inputs).
  - Empty states across WatchlistTable, Portfolio, QuotaPage, and AgentsPage (confirm English empty messages render).
  - Status badges with extreme/boundary values (e.g. 0 quota, expired items, disconnected status).
- E2E User Scenario:
  - Open dashboard root, navigate through Overview -> Funnel -> Watchlist -> Portfolio -> Quota -> Agents -> Settings.
  - Verify every screen renders zero Malay strings and all UI controls show concise plain English.

## 5. Risks & Non-Goals
- Risks:
  - Unintentionally breaking test suites that assert against old Malay string literals. Mitigation: Identify and update test assertions alongside component updates.
  - Modifying backend API field names during UI refactoring. Mitigation: Only alter JSX rendered text, placeholders, labels, and aria attributes.
- Non-Goals:
  - Do not introduce multi-language switching or locale runtime frameworks.
  - Do not alter backend API contracts, database schemas, or trade execution logic.
