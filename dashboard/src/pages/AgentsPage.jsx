import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  CircularProgress,
  Alert,
  LinearProgress,
  Tooltip,
  Paper,
  Tabs,
  Tab,
  TablePagination,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PsychologyIcon from '@mui/icons-material/Psychology';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import NewspaperIcon from '@mui/icons-material/Newspaper';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SecurityIcon from '@mui/icons-material/Security';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { sneatTokens } from '../theme';

export function AgentsPage({ screenerConfig }) {
  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(Number(val) || 0);
  };

  const [loading, setLoading] = useState(true);
  const [activityData, setActivityData] = useState(null);
  const [selectedSymbolIndex, setSelectedSymbolIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [cancellingOrder, setCancellingOrder] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(() => Number(screenerConfig?.agent_orders_per_page || 10));
  const [pauseBuying, setPauseBuying] = useState(() => Boolean(screenerConfig?.pause_buying));
  const [togglingPause, setTogglingPause] = useState(false);

  // Server-side orders state (HOM-417/418 Option B)
  const [ordersPage, setOrdersPage] = useState(0);
  const [ordersFilter, setOrdersFilter] = useState('all');
  const [paginatedOrders, setPaginatedOrders] = useState([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [thesisModalOrder, setThesisModalOrder] = useState(null);

  useEffect(() => {
    if (screenerConfig?.agent_orders_per_page) {
      setRowsPerPage(Number(screenerConfig.agent_orders_per_page));
    }
    if (screenerConfig?.pause_buying !== undefined) {
      setPauseBuying(Boolean(screenerConfig.pause_buying));
    }
  }, [screenerConfig?.agent_orders_per_page, screenerConfig?.pause_buying]);

  const fetchOrders = useCallback(async (p = ordersPage, limit = rowsPerPage, filt = ordersFilter) => {
    try {
      setOrdersLoading(true);
      const res = await fetch(`/api/agents/orders?page=${p + 1}&limit=${limit}&filter=${encodeURIComponent(filt)}`);
      if (res.ok) {
        const json = await res.json();
        setPaginatedOrders(json.orders || []);
        setOrdersTotal(json.total !== undefined ? json.total : (json.orders?.length || 0));
      }
    } catch (err) {
      console.warn('[AgentsPage] Fetch orders error:', err);
    } finally {
      setOrdersLoading(false);
    }
  }, [ordersPage, rowsPerPage, ordersFilter]);

  useEffect(() => {
    fetchOrders(ordersPage, rowsPerPage, ordersFilter);
  }, [fetchOrders, ordersPage, rowsPerPage, ordersFilter]);

  const fetchPauseBuying = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/pause-buying');
      if (res.ok) {
        const data = await res.json();
        setPauseBuying(Boolean(data.pause_buying));
      }
    } catch (err) {
      console.warn('[AgentsPage] Fetch pause-buying error:', err);
    }
  }, []);

  const handleTogglePauseBuying = async () => {
    try {
      setTogglingPause(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      const targetState = !pauseBuying;
      const res = await fetch('/api/agents/pause-buying', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: targetState }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setPauseBuying(targetState);
      setSuccessMsg(data.message || (targetState ? 'New buying paused.' : 'Buying resumed.'));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('screener-config-updated'));
      }
      await fetchActivity();
      await fetchOrders();
    } catch (err) {
      setErrorMsg('Error updating pause-buying status: ' + err.message);
    } finally {
      setTogglingPause(false);
    }
  };

  const fetchActivity = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/agents/activity?limit=50');
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const data = await res.json();
      setActivityData(data);
      setErrorMsg(null);
    } catch (err) {
      console.error('[AgentsPage] Fetch error:', err);
      setErrorMsg('Failed to load agent activity from Bridge: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivity();
    fetchPauseBuying();
    const interval = setInterval(() => {
      fetchActivity();
      fetchPauseBuying();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchActivity, fetchPauseBuying]);

  const handleCancelOrder = async (orderId) => {
    if (!orderId) return;
    try {
      setCancellingOrder(orderId);
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await fetch(`/api/agents/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.detail || `HTTP ${res.status}`);
      }
      setSuccessMsg(data.message || `Order ${orderId} successfully cancelled.`);
      await fetchActivity();
      await fetchOrders();
    } catch (err) {
      setErrorMsg('Error cancelling order: ' + err.message);
    } finally {
      setCancellingOrder(null);
    }
  };

  const deliberations = activityData?.deliberations || [];
  const selectedDelib = deliberations[selectedSymbolIndex] || deliberations[0] || null;
  const orders = activityData?.orders || [];
  const stats = activityData?.stats || {};
  const cycles = activityData?.cycles || [];
  const latestCycle = cycles[0] || null;
  const approvedCount = deliberations.filter((d) => d.final_decision?.includes('APPROVED')).length;
  const totalCandidatesCount = deliberations.length || latestCycle?.total_candidates || 0;

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', overflowX: 'hidden', py: 1 }}>
      {/* Top Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', md: 'center' },
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <PsychologyIcon sx={{ color: sneatTokens.primary.main, fontSize: 32 }} />
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              L1 -&gt; L4: Agent Team Activity
            </Typography>
            <Chip
              label="Moomoo OpenD Paper Trading (SIMULATE)"
              size="small"
              sx={{
                bgcolor: sneatTokens.info.soft,
                color: sneatTokens.info.main,
                fontWeight: 700,
                fontSize: '0.75rem',
              }}
            />
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, wordBreak: 'break-word' }}>
            Agent Decision Pipeline: L0 Screener → L1 Tariq &amp; Nawwar → L2 Haziq → L3 Danial → L4 Moomoo OpenD
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            id="btn-toggle-pause-buying"
            variant="contained"
            color={pauseBuying ? 'success' : 'warning'}
            size="medium"
            startIcon={pauseBuying ? <PlayArrowIcon /> : <PauseCircleOutlineIcon />}
            onClick={handleTogglePauseBuying}
            disabled={togglingPause || loading}
            sx={{
              borderRadius: 2,
              fontWeight: 700,
              textTransform: 'none',
              boxShadow: pauseBuying ? '0 2px 8px rgba(46, 204, 113, 0.3)' : '0 2px 8px rgba(255, 171, 0, 0.3)',
            }}
          >
            {togglingPause ? (
              <CircularProgress size={18} color="inherit" />
            ) : pauseBuying ? (
              'Resume Buying'
            ) : (
              'Pause Buying'
            )}
          </Button>

          <Button
            id="btn-refresh-agents"
            variant="outlined"
            size="medium"
            startIcon={<RefreshIcon />}
            onClick={fetchActivity}
            disabled={loading}
            sx={{ borderRadius: 2, textTransform: 'none' }}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Notifications */}
      {errorMsg && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}
      {successMsg && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}

      {/* Alert Monitor-Only Mode (Buying Paused) */}
      {pauseBuying && (
        <Alert
          severity="warning"
          id="alert-pause-buying-active"
          sx={{
            mb: 3,
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'warning.main',
            alignItems: 'center',
          }}
          icon={<PauseCircleOutlineIcon sx={{ fontSize: 28 }} />}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              MONITOR-ONLY MODE ACTIVE (BUYING PAUSED)
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.25 }}>
              New stock buying is currently paused by the user. Agents L1-L4 execute technical &amp; sentiment analysis only and monitor existing portfolio holdings.
            </Typography>
          </Box>
        </Alert>
      )}

      {/* Summary Header: Candidates in Latest Cycle (HOM-302 Clean Layout) */}
      <Card sx={{ mb: 3, borderRadius: 2.5, border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: sneatTokens.info.soft,
                  color: sneatTokens.info.main,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <PsychologyIcon sx={{ fontSize: 28 }} />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 0.5 }}>
                  LATEST CYCLE STATUS
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.7rem' }}>
                      L0 Screener Buy Candidates
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                      <Typography variant="h5" sx={{ fontWeight: 800, color: pauseBuying ? sneatTokens.warning.main : sneatTokens.info.main }}>
                        {activityData?.watchlist_candidates_count ?? latestCycle?.watchlist_candidates ?? 0}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                        {pauseBuying ? '(Paused)' : 'vetted'}
                      </Typography>
                    </Box>
                  </Box>
                  <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.7rem' }}>
                      Active Portfolio Monitoring
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                      <Typography variant="h5" sx={{ fontWeight: 800, color: sneatTokens.success.main }}>
                        {activityData?.monitored_positions_count ?? latestCycle?.monitored_positions ?? 0}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                        held active
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Chip
                id="chip-actual-passed-count"
                icon={<CheckCircleIcon sx={{ fontSize: 18 }} />}
                label={`Passed Candidates: ${approvedCount} / ${totalCandidatesCount}`}
                size="medium"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  bgcolor: approvedCount > 0 ? sneatTokens.success.soft : 'action.hover',
                  color: approvedCount > 0 ? sneatTokens.success.main : 'text.secondary',
                  border: '1px solid',
                  borderColor: approvedCount > 0 ? sneatTokens.success.main : 'divider',
                  '& .MuiChip-icon': {
                    color: approvedCount > 0 ? sneatTokens.success.main : 'text.secondary',
                  },
                }}
              />
              <Chip
                label={`Orders Placed: ${latestCycle?.orders_placed ?? orders.length}`}
                size="medium"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  bgcolor: sneatTokens.primary.soft,
                  color: sneatTokens.primary.main,
                  border: '1px solid',
                  borderColor: sneatTokens.primary.main,
                }}
              />
              {latestCycle?.cycle_id && (
                <Chip
                  variant="outlined"
                  label={`Cycle: ${latestCycle.cycle_id.substring(0, 16)}...`}
                  size="small"
                  sx={{ color: 'text.secondary', borderColor: 'divider', fontSize: '0.75rem' }}
                />
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Visual Pipeline Stepper with Directional Connectors (HOM-302) */}
      <Card sx={{ mb: 3, borderRadius: 2.5, border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Agent Team Decision Pipeline Flow
            </Typography>
            <Chip
              id="chip-active-portfolio-watch"
              icon={<SecurityIcon sx={{ fontSize: 16 }} />}
              label={`Active Portfolio Monitoring: ${activityData?.monitored_positions_count ?? latestCycle?.monitored_positions ?? 0} Held Positions (ACTIVE)`}
              size="small"
              sx={{
                fontWeight: 700,
                bgcolor: sneatTokens.success.soft,
                color: sneatTokens.success.main,
                border: '1px solid',
                borderColor: sneatTokens.success.main,
                '& .MuiChip-icon': { color: sneatTokens.success.main },
              }}
            />
          </Box>

          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', md: 'row' },
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
            }}
          >
            {/* L0 */}
            <Paper
              elevation={0}
              sx={{
                flex: 1,
                width: '100%',
                p: 2,
                borderRadius: 2,
                bgcolor: 'action.hover',
                border: '1px solid',
                borderColor: pauseBuying ? sneatTokens.warning.main : 'divider',
                textAlign: 'center',
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block' }}>
                L0 SCREENER
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>
                Buy Candidates
              </Typography>
              <Chip
                id="chip-l0-buy-candidates"
                label={
                  pauseBuying
                    ? `Buy Candidates: ${activityData?.watchlist_candidates_count ?? latestCycle?.watchlist_candidates ?? 0} (PAUSED)`
                    : `Buy Candidates: ${activityData?.watchlist_candidates_count ?? latestCycle?.watchlist_candidates ?? 0} (ACTIVE)`
                }
                size="small"
                sx={{
                  mt: 1,
                  fontWeight: 700,
                  bgcolor: pauseBuying ? sneatTokens.warning.soft : 'action.selected',
                  color: pauseBuying ? sneatTokens.warning.main : 'text.primary',
                  border: pauseBuying ? `1px solid ${sneatTokens.warning.main}` : undefined,
                }}
              />
            </Paper>

            {/* Arrow L0 -> L1 */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: sneatTokens.primary.main }}>
              <ArrowForwardIcon sx={{ display: { xs: 'none', md: 'block' }, fontSize: 24 }} />
              <ArrowDownwardIcon sx={{ display: { xs: 'block', md: 'none' }, fontSize: 24, my: 0.5 }} />
            </Box>

            {/* L1 */}
            <Paper
              elevation={0}
              sx={{
                flex: 1,
                width: '100%',
                p: 2,
                borderRadius: 2,
                bgcolor: sneatTokens.info.soft,
                border: '1px solid',
                borderColor: sneatTokens.info.main,
                textAlign: 'center',
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.info.main, display: 'block' }}>
                L1 INTELLIGENCE
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>
                Tariq &amp; Nawwar
              </Typography>
              <Chip
                label={`${latestCycle?.passed_l1 ?? 0} Passed L1`}
                size="small"
                sx={{ mt: 1, fontWeight: 700, bgcolor: sneatTokens.info.main, color: '#fff' }}
              />
            </Paper>

            {/* Arrow L1 -> L2 */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: sneatTokens.primary.main }}>
              <ArrowForwardIcon sx={{ display: { xs: 'none', md: 'block' }, fontSize: 24 }} />
              <ArrowDownwardIcon sx={{ display: { xs: 'block', md: 'none' }, fontSize: 24, my: 0.5 }} />
            </Box>

            {/* L2 */}
            <Paper
              elevation={0}
              sx={{
                flex: 1,
                width: '100%',
                p: 2,
                borderRadius: 2,
                bgcolor: sneatTokens.primary.soft,
                border: '1px solid',
                borderColor: sneatTokens.primary.main,
                textAlign: 'center',
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.primary.main, display: 'block' }}>
                L2 STRATEGY &amp; PORTFOLIO
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>
                Haziq (Lead)
              </Typography>
              <Chip
                label={`${latestCycle?.passed_l2 ?? 0} Passed L2`}
                size="small"
                sx={{ mt: 1, fontWeight: 700, bgcolor: sneatTokens.primary.main, color: '#fff' }}
              />
            </Paper>

            {/* Arrow L2 -> L3 */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: sneatTokens.primary.main }}>
              <ArrowForwardIcon sx={{ display: { xs: 'none', md: 'block' }, fontSize: 24 }} />
              <ArrowDownwardIcon sx={{ display: { xs: 'block', md: 'none' }, fontSize: 24, my: 0.5 }} />
            </Box>

            {/* L3 */}
            <Paper
              elevation={0}
              sx={{
                flex: 1,
                width: '100%',
                p: 2,
                borderRadius: 2,
                bgcolor: sneatTokens.warning.soft,
                border: '1px solid',
                borderColor: sneatTokens.warning.main,
                textAlign: 'center',
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.warning.main, display: 'block' }}>
                L3 RISK AUDIT
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>
                Danial &amp; 8 Hard Rules
              </Typography>
              <Chip
                label={`${latestCycle?.passed_l3 ?? 0} Passed L3`}
                size="small"
                sx={{ mt: 1, fontWeight: 700, bgcolor: sneatTokens.warning.main, color: '#fff' }}
              />
            </Paper>

            {/* Arrow L3 -> L4 */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: sneatTokens.primary.main }}>
              <ArrowForwardIcon sx={{ display: { xs: 'none', md: 'block' }, fontSize: 24 }} />
              <ArrowDownwardIcon sx={{ display: { xs: 'block', md: 'none' }, fontSize: 24, my: 0.5 }} />
            </Box>

            {/* L4 */}
            <Paper
              elevation={0}
              sx={{
                flex: 1,
                width: '100%',
                p: 2,
                borderRadius: 2,
                bgcolor: sneatTokens.success.soft,
                border: '1px solid',
                borderColor: sneatTokens.success.main,
                textAlign: 'center',
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.success.main, display: 'block' }}>
                L4 EXECUTION
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>
                Moomoo OpenD Paper
              </Typography>
              <Chip
                id="chip-pipeline-l4-status"
                label={pauseBuying ? 'Buying Paused (Monitor-Only)' : `${latestCycle?.orders_placed ?? orders.length} Orders`}
                size="small"
                sx={{
                  mt: 1,
                  fontWeight: 700,
                  bgcolor: pauseBuying ? sneatTokens.warning.main : sneatTokens.success.main,
                  color: '#fff',
                }}
              />
            </Paper>
          </Box>
        </CardContent>
      </Card>

      {/* Candidate Selector Tabs */}
      {deliberations.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
              SELECT STOCK CANDIDATE TO REVIEW AGENT DELIBERATION LOGS:
            </Typography>
            <Chip
              id="chip-actual-passed-summary"
              label={`${approvedCount} Passed / ${totalCandidatesCount} Stocks`}
              size="small"
              color={approvedCount > 0 ? 'success' : 'default'}
              variant="outlined"
              sx={{ fontWeight: 700 }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {deliberations.map((d, idx) => {
              const isSelected = idx === selectedSymbolIndex;
              const isApproved = d.final_decision?.includes('APPROVED');
              const isHeld = Boolean(d.is_held || d.tariq?.is_held || d.haziq?.is_held || d.final_decision?.includes('HOLD_POSITION') || d.stage_reached === 'ACTIVE_WATCH');

              let chipIcon = <CancelIcon sx={{ fontSize: 16 }} />;
              let chipColor = 'text.secondary';
              let chipBorder = 'divider';
              let chipBg = isSelected ? 'action.selected' : 'action.hover';

              if (isApproved) {
                chipIcon = <CheckCircleIcon sx={{ fontSize: 16 }} />;
                chipColor = isSelected ? '#ffffff' : sneatTokens.success.main;
                chipBorder = sneatTokens.success.main;
                chipBg = isSelected ? sneatTokens.success.main : sneatTokens.success.soft;
              } else if (isHeld) {
                chipIcon = <SecurityIcon sx={{ fontSize: 16 }} />;
                chipColor = isSelected ? '#ffffff' : sneatTokens.info.main;
                chipBorder = sneatTokens.info.main;
                chipBg = isSelected ? sneatTokens.info.main : sneatTokens.info.soft;
              }

              return (
                <Chip
                  key={d.symbol || idx}
                  id={`chip-deliberation-${d.symbol}`}
                  label={isHeld ? `${d.symbol} (HELD)` : d.symbol}
                  onClick={() => setSelectedSymbolIndex(idx)}
                  icon={chipIcon}
                  sx={{
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    py: 0.5,
                    px: 0.5,
                    borderRadius: 2,
                    bgcolor: chipBg,
                    color: chipColor,
                    borderColor: chipBorder,
                    border: '1px solid',
                    boxShadow: isSelected ? '0 2px 8px rgba(0, 0, 0, 0.15)' : 'none',
                    '& .MuiChip-icon': {
                      color: chipColor,
                    },
                  }}
                />
              );
            })}
          </Box>
        </Box>
      )}

      {/* 4 Agent Deliberation Cards */}
      {selectedDelib ? (
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Agent Deliberation for Stock: {selectedDelib.symbol}
            </Typography>
            <Chip
              label={selectedDelib.final_decision}
              color={selectedDelib.final_decision?.includes('APPROVED') ? 'success' : 'error'}
              sx={{ fontWeight: 700 }}
            />
          </Box>

          <Grid container spacing={2.5}>
            {/* Card 1: Tariq (L1 Technical) */}
            <Grid item xs={12} md={6}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: selectedDelib.tariq?.passed ? sneatTokens.info.main : 'divider',
                }}
              >
                <CardContent sx={{ p: 2.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TrendingUpIcon sx={{ color: sneatTokens.info.main }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Tariq (L1 Technical Analyst)
                      </Typography>
                    </Box>
                    <Chip
                      label={selectedDelib.tariq?.passed ? 'PASS (>=60)' : 'REJECTED'}
                      size="small"
                      color={selectedDelib.tariq?.passed ? 'info' : 'error'}
                      sx={{ fontWeight: 700 }}
                    />
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      TECHNICAL SCORE ($S_{'{tech}'}$)
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      Threshold: ≥ 60.0 | Margin: {selectedDelib.tariq?.s_tech ? (selectedDelib.tariq.s_tech - 60).toFixed(1) : '-'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, my: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={selectedDelib.tariq?.s_tech || 0}
                      sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                      color={selectedDelib.tariq?.passed ? 'info' : 'error'}
                    />
                    <Typography variant="h6" sx={{ fontWeight: 700, minWidth: 50 }}>
                      {selectedDelib.tariq?.s_tech}/100
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, my: 1.5 }}>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Wyckoff Phase</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>{selectedDelib.tariq?.wyckoff_phase || '-'}</Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Elliott / SMC FVG</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>{selectedDelib.tariq?.smc_fvg_confluence || '-'}</Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Support Zone</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>${selectedDelib.tariq?.support_level || '-'}</Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Resistance Zone</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>${selectedDelib.tariq?.resistance_level || '-'}</Typography>
                    </Box>
                  </Box>

                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                    {selectedDelib.tariq?.notes}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Card 2: Nawwar (L1 Sentiment & Macro) */}
            <Grid item xs={12} md={6}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: selectedDelib.nawwar?.passed ? sneatTokens.primary.main : 'divider',
                }}
              >
                <CardContent sx={{ p: 2.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <NewspaperIcon sx={{ color: sneatTokens.primary.main }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Nawwar (L1 Sentiment & News Scout)
                      </Typography>
                    </Box>
                    <Chip
                      label={selectedDelib.nawwar?.passed ? 'PASS (>=80)' : 'REJECTED'}
                      size="small"
                      color={selectedDelib.nawwar?.passed ? 'primary' : 'error'}
                      sx={{ fontWeight: 700 }}
                    />
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      NORMALIZED SENTIMENT SCORE ($S_{'{sent_norm}'}$)
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      Threshold: ≥ 80.0 | Margin: {selectedDelib.nawwar?.s_sent_norm ? (selectedDelib.nawwar.s_sent_norm - 80).toFixed(1) : '-'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, my: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={selectedDelib.nawwar?.s_sent_norm || 0}
                      sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                      color={selectedDelib.nawwar?.passed ? 'primary' : 'error'}
                    />
                    <Typography variant="h6" sx={{ fontWeight: 700, minWidth: 50 }}>
                      {selectedDelib.nawwar?.s_sent_norm}/100
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, my: 1.5 }}>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Raw Score</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
                        {selectedDelib.nawwar?.s_sent_raw != null ? (selectedDelib.nawwar.s_sent_raw > 0 ? `+${selectedDelib.nawwar.s_sent_raw}` : selectedDelib.nawwar.s_sent_raw) : '-'} / ±100
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Sentiment Label</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>{selectedDelib.nawwar?.sentiment_label || '-'}</Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Earnings Risk (5 Days)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word', color: selectedDelib.nawwar?.earnings_within_5d ? 'error.main' : 'success.main' }}>
                        {selectedDelib.nawwar?.earnings_within_5d ? 'RISK DETECTED' : 'CLEAN'}
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>FOMC Macro Risk</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word', color: selectedDelib.nawwar?.fomc_macro_risk ? 'error.main' : 'success.main' }}>
                        {selectedDelib.nawwar?.fomc_macro_risk ? 'RISK DETECTED' : 'CLEAN'}
                      </Typography>
                    </Box>
                  </Box>

                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                    {selectedDelib.nawwar?.notes}
                  </Typography>

                  <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      Latest News &amp; Sentiment Coverage:
                    </Typography>
                    <Button
                      component="a"
                      href={selectedDelib.nawwar?.news_url || `https://finance.yahoo.com/quote/${(selectedDelib.symbol || '').replace(/^US\./, '')}/news/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="small"
                      variant="outlined"
                      color="primary"
                      endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
                      sx={{ borderRadius: 1.5, textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', py: 0.5 }}
                    >
                      {selectedDelib.nawwar?.news_headline || `News Link for ${selectedDelib.symbol}`}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Card 3: Haziq (L2 Portfolio & Strategy Lead) */}
            <Grid item xs={12} md={6}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: selectedDelib.haziq?.passed ? sneatTokens.success.main : 'divider',
                }}
              >
                <CardContent sx={{ p: 2.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AccountBalanceIcon sx={{ color: sneatTokens.success.main }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Haziq (L2 Portfolio & Strategy Lead)
                      </Typography>
                    </Box>
                    <Chip
                      label={selectedDelib.haziq?.passed ? 'GATE OPEN (>=65)' : 'REJECTED'}
                      size="small"
                      color={selectedDelib.haziq?.passed ? 'success' : 'error'}
                      sx={{ fontWeight: 700 }}
                    />
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      COMPOSITE SCORE ($S_{'{total}'} = 0.65 \times S_{'{tech}'} + 0.35 \times S_{'{sent_norm}'}$)
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      Threshold: ≥ 65.0 | Margin: {selectedDelib.haziq?.s_total ? (selectedDelib.haziq.s_total - 65).toFixed(1) : '-'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, my: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={selectedDelib.haziq?.s_total || 0}
                      sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                      color={selectedDelib.haziq?.passed ? 'success' : 'error'}
                    />
                    <Typography variant="h6" sx={{ fontWeight: 700, minWidth: 50 }}>
                      {selectedDelib.haziq?.s_total}/100
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, my: 1.5 }}>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Entry Price</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>${selectedDelib.haziq?.entry_price?.toFixed(2)}</Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Stop Loss (1.5x ATR)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word', color: 'error.main' }}>
                        ${selectedDelib.haziq?.stop_loss_price?.toFixed(2)}
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>TP1 Target (1:1.5 R:R)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word', color: 'success.main' }}>
                        ${selectedDelib.haziq?.take_profit_price?.toFixed(2)}
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Position Size (1.5% Capital)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                        {selectedDelib.haziq?.allocated_shares} shares (${selectedDelib.haziq?.position_value?.toFixed(2)})
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Effective Capital Base</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word', color: 'success.main' }}>
                        {formatCurrency(selectedDelib.haziq?.account_equity_used || 100000)}
                      </Typography>
                    </Box>
                  </Box>

                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                    {selectedDelib.haziq?.thesis}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Card 4: Danial (L3 Risk & Compliance) */}
            <Grid item xs={12} md={6}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: selectedDelib.danial?.passed ? sneatTokens.warning.main : 'divider',
                }}
              >
                <CardContent sx={{ p: 2.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <SecurityIcon sx={{ color: sneatTokens.warning.main }} />
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Danial (L3 Risk & Compliance Officer)
                      </Typography>
                    </Box>
                    <Chip
                      label={selectedDelib.danial?.passed ? '8/8 PASSED' : 'REJECTED'}
                      size="small"
                      color={selectedDelib.danial?.passed ? 'success' : 'error'}
                      sx={{ fontWeight: 700 }}
                    />
                  </Box>

                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mb: 1, display: 'block' }}>
                    8 Hard Rules Check (Risk Audit Matrix):
                  </Typography>

                  <TableContainer component={Paper} elevation={0} sx={{ bgcolor: 'action.hover', borderRadius: 1.5 }}>
                    <Table size="small">
                      <TableBody>
                        {selectedDelib.danial?.rule_checks?.map((rc, rIdx) => (
                          <TableRow key={rIdx}>
                            <TableCell sx={{ py: 0.5, borderBottom: 'none', width: 24 }}>
                              {rc.passed ? (
                                <CheckCircleIcon sx={{ color: sneatTokens.success.main, fontSize: 16 }} />
                              ) : (
                                <CancelIcon sx={{ color: sneatTokens.error.main, fontSize: 16 }} />
                              )}
                            </TableCell>
                            <TableCell sx={{ py: 0.5, borderBottom: 'none', fontWeight: 600, fontSize: '0.75rem' }}>
                              {rc.rule}
                            </TableCell>
                            <TableCell sx={{ py: 0.5, borderBottom: 'none', fontSize: '0.72rem', color: 'text.secondary', textAlign: 'right' }}>
                              {rc.detail}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1.5 }}>
                    {selectedDelib.danial?.notes}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      ) : (
        <Card sx={{ p: 4, textAlign: 'center', mb: 3, borderRadius: 2 }}>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            No simulated cycle deliberation data. The agent pipeline runs automatically in the background during US market hours (09:45 – 15:45 NY).
          </Typography>
        </Card>
      )}

      {/* Paper Trading Orders Table (Option B) */}
      <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ShoppingCartIcon sx={{ color: sneatTokens.success.main }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Moomoo OpenD Paper Trading Orders Table
              </Typography>
              <Chip
                label={`${ordersTotal} Total`}
                size="small"
                sx={{ fontWeight: 700, bgcolor: sneatTokens.primary.soft, color: sneatTokens.primary.main }}
              />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <FormControl size="small" sx={{ minWidth: 170 }}>
                <InputLabel id="order-filter-label" sx={{ fontSize: '0.82rem' }}>Filter Orders</InputLabel>
                <Select
                  labelId="order-filter-label"
                  id="order-filter-select"
                  value={ordersFilter}
                  label="Filter Orders"
                  onChange={(e) => {
                    setOrdersFilter(e.target.value);
                    setOrdersPage(0);
                  }}
                  sx={{ borderRadius: 2, fontSize: '0.82rem', height: 38 }}
                >
                  <MenuItem value="all">All Orders</MenuItem>
                  <MenuItem value="active">Active / Open</MenuItem>
                  <MenuItem value="closed">Closed (Round-Trip)</MenuItem>
                </Select>
              </FormControl>
              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => fetchOrders(ordersPage, rowsPerPage, ordersFilter)}
                sx={{ borderRadius: 2, textTransform: 'none', height: 38 }}
              >
                Refresh
              </Button>
            </Box>
          </Box>

          {ordersLoading && paginatedOrders.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : paginatedOrders.length > 0 ? (
            <>
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, maxWidth: '100%', overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>ORDER ID</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>SYMBOL</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>SIDE</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>QUANTITY</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>ORDER PRICE</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>REASON / THESIS</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>STOP LOSS</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>TAKE PROFIT</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>OPEND STATUS</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>TIMESTAMP</TableCell>
                      <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>ACTION</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedOrders.map((ord, oIdx) => {
                      const orderKey = ord.order_id || ord.client_order_id;
                      const isCancellable =
                        ord.status === 'SUBMITTED' ||
                        ord.status === 'PENDING' ||
                        ord.status === 'SUBMITTED_PAPER_SIM';
                      const isSell = (ord.order_side || ord.side) === 'SELL';
                      const hasPnl = ord.realized_pnl_usd !== null && ord.realized_pnl_usd !== undefined;
                      const isGain = hasPnl && Number(ord.realized_pnl_usd) >= 0;

                      return (
                        <TableRow key={ord.client_order_id || ord.id || oIdx} hover>
                          <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                            {ord.order_id || ord.client_order_id?.substring(0, 8)}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>{ord.symbol}</TableCell>
                          <TableCell>
                            <Chip
                              label={ord.order_side || ord.side || 'BUY'}
                              size="small"
                              sx={{
                                fontWeight: 700,
                                bgcolor: isSell ? sneatTokens.error.soft : sneatTokens.success.soft,
                                color: isSell ? sneatTokens.error.main : sneatTokens.success.main,
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{ord.quantity} shares</TableCell>
                          {/* ORDER PRICE (with Cost Price & P&L matching for SELL orders) */}
                          <TableCell sx={{ minWidth: 160 }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Chip
                                  label={`${isSell ? 'SELL LIMIT' : 'BUY LIMIT'}: $${Number(ord.entry_price || ord.price || 0).toFixed(2)}`}
                                  size="small"
                                  variant="outlined"
                                  sx={{
                                    fontWeight: 700,
                                    fontSize: '0.72rem',
                                    borderColor: isSell ? sneatTokens.error.main : sneatTokens.success.main,
                                    color: isSell ? sneatTokens.error.main : sneatTokens.success.main,
                                  }}
                                />
                              </Box>
                              {isSell && (
                                <Box sx={{ fontSize: '0.72rem', color: 'text.secondary', display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                                  <span>Cost: {ord.cost_price ? `$${Number(ord.cost_price).toFixed(2)}` : 'N/A'}</span>
                                  {hasPnl && (
                                    <Chip
                                      label={`${isGain ? '+' : ''}$${Number(ord.realized_pnl_usd).toFixed(2)} (${isGain ? '+' : ''}${Number(ord.realized_pnl_pct || 0).toFixed(2)}%)`}
                                      size="small"
                                      sx={{
                                        fontWeight: 700,
                                        fontSize: '0.68rem',
                                        height: 18,
                                        bgcolor: isGain ? sneatTokens.success.soft : sneatTokens.error.soft,
                                        color: isGain ? sneatTokens.success.main : sneatTokens.error.main,
                                        alignSelf: 'flex-start',
                                      }}
                                    />
                                  )}
                                  {ord.buy_order_ref && (
                                    <span style={{ fontSize: '0.68rem', opacity: 0.8 }}>
                                      Ref: {ord.buy_order_ref}
                                    </span>
                                  )}
                                </Box>
                              )}
                            </Box>
                          </TableCell>
                          {/* REASON / THESIS */}
                          <TableCell sx={{ maxWidth: 220 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Tooltip title={ord.thesis || ord.message || 'Audit record'}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontSize: '0.75rem',
                                    fontWeight: 500,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 180,
                                    color: 'text.primary',
                                  }}
                                >
                                  {ord.thesis || ord.message || 'Paper Order'}
                                </Typography>
                              </Tooltip>
                              <Tooltip title="View full deliberation & thesis breakdown">
                                <IconButton
                                  size="small"
                                  onClick={() => setThesisModalOrder(ord)}
                                  sx={{ p: 0.25, color: sneatTokens.primary.main }}
                                >
                                  <InfoOutlinedIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ color: 'error.main', fontWeight: 600 }}>
                            ${Number(ord.stop_loss_price || 0).toFixed(2)}
                          </TableCell>
                          <TableCell sx={{ color: 'success.main', fontWeight: 600 }}>
                            ${Number(ord.take_profit_price || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={ord.status || 'SUBMITTED'}
                              size="small"
                              color={
                                ord.status?.includes('REJECT')
                                  ? 'error'
                                  : ord.status === 'CANCELLED'
                                  ? 'default'
                                  : ord.status === 'FILLED'
                                  ? 'success'
                                  : 'warning'
                              }
                              sx={{ fontWeight: 600 }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            {ord.created_at ? new Date(ord.created_at).toLocaleString() : '-'}
                          </TableCell>
                          <TableCell sx={{ textAlign: 'center' }}>
                            {isCancellable ? (
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                id={`btn-cancel-order-${orderKey}`}
                                disabled={cancellingOrder === orderKey}
                                onClick={() => handleCancelOrder(orderKey)}
                                sx={{
                                  fontSize: '0.72rem',
                                  py: 0.25,
                                  px: 1,
                                  minWidth: 64,
                                  borderRadius: 1.5,
                                  textTransform: 'none',
                                  fontWeight: 600,
                                }}
                              >
                                {cancellingOrder === orderKey ? (
                                  <CircularProgress size={14} color="inherit" />
                                ) : (
                                  'Cancel'
                                )}
                              </Button>
                            ) : (
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {ord.status === 'CANCELLED' ? 'Cancelled' : (ord.status === 'FILLED' ? 'Filled' : '-')}
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                rowsPerPageOptions={[5, 10, 25, 50]}
                component="div"
                count={ordersTotal}
                rowsPerPage={rowsPerPage}
                page={ordersPage}
                onPageChange={(event, newPage) => {
                  setOrdersPage(newPage);
                  fetchOrders(newPage, rowsPerPage, ordersFilter);
                }}
                onRowsPerPageChange={(event) => {
                  const newLimit = parseInt(event.target.value, 10);
                  setRowsPerPage(newLimit);
                  setOrdersPage(0);
                  fetchOrders(0, newLimit, ordersFilter);
                }}
                labelRowsPerPage="Rows per page:"
                labelDisplayedRows={({ from, to, count }) => `${from}–${to} of ${count !== -1 ? count : `more than ${to}`}`}
                sx={{ borderTop: '1px solid', borderColor: 'divider' }}
              />
            </>
          ) : (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              No orders found matching the filter "{ordersFilter}".
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Thesis & Deliberation Modal Dialog */}
      <Dialog
        open={Boolean(thesisModalOrder)}
        onClose={() => setThesisModalOrder(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PsychologyIcon sx={{ color: sneatTokens.primary.main }} />
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
              Action Rationale & Thesis: {thesisModalOrder?.symbol}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setThesisModalOrder(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ py: 2 }}>
          {thesisModalOrder && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block' }}>
                  ACTION SUMMARY
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, color: 'text.primary', mt: 0.25 }}>
                  {thesisModalOrder.thesis || thesisModalOrder.message || 'Paper Order Executed'}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                  <Chip
                    label={`Side: ${thesisModalOrder.order_side || thesisModalOrder.side || 'BUY'}`}
                    size="small"
                    sx={{ fontWeight: 600 }}
                  />
                  <Chip
                    label={`Source: ${thesisModalOrder.source || 'AGENT_PIPELINE'}`}
                    size="small"
                    variant="outlined"
                    sx={{ fontWeight: 600 }}
                  />
                  {thesisModalOrder.cycle_id && (
                    <Chip
                      label={`Cycle: ${thesisModalOrder.cycle_id}`}
                      size="small"
                      variant="outlined"
                      sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }}
                    />
                  )}
                </Box>
              </Box>

              {thesisModalOrder.thesis_detail?.haziq && Object.keys(thesisModalOrder.thesis_detail.haziq).length > 0 && (
                <Box sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: sneatTokens.primary.main, mb: 0.5 }}>
                    L2 Haziq Strategy Synthesis
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.82rem', mb: 0.5 }}>
                    Composite Score: <strong>{thesisModalOrder.thesis_detail.haziq.composite_score?.toFixed(1) || 'N/A'}</strong> | Mode: <strong>{thesisModalOrder.thesis_detail.haziq.trading_mode || 'DAY'}</strong>
                  </Typography>
                  {thesisModalOrder.thesis_detail.haziq.rationale && (
                    <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                      "{thesisModalOrder.thesis_detail.haziq.rationale}"
                    </Typography>
                  )}
                </Box>
              )}

              {thesisModalOrder.thesis_detail?.danial && Object.keys(thesisModalOrder.thesis_detail.danial).length > 0 && (
                <Box sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: sneatTokens.success.main, mb: 0.5 }}>
                    L3 Danial Risk & Compliance (8 Hard Rules)
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
                    Status: <strong>{thesisModalOrder.thesis_detail.danial.passed ? 'PASSED ALL HARD RULES' : 'FAILED'}</strong>
                  </Typography>
                  {thesisModalOrder.thesis_detail.danial.notes && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                      {thesisModalOrder.thesis_detail.danial.notes}
                    </Typography>
                  )}
                </Box>
              )}

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
                <div>Order Ref: <code style={{ fontFamily: 'monospace' }}>{thesisModalOrder.order_id || thesisModalOrder.client_order_id}</code></div>
                {thesisModalOrder.buy_order_ref && (
                  <div>Linked Buy Reference: <code style={{ fontFamily: 'monospace' }}>{thesisModalOrder.buy_order_ref}</code></div>
                )}
                {thesisModalOrder.hold_duration && thesisModalOrder.hold_duration !== 'N/A' && (
                  <div>Holding Duration: <strong>{thesisModalOrder.hold_duration}</strong></div>
                )}
                <div>Executed At: {thesisModalOrder.created_at ? new Date(thesisModalOrder.created_at).toLocaleString() : '-'}</div>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5 }}>
          <Button onClick={() => setThesisModalOrder(null)} variant="contained" size="small" sx={{ textTransform: 'none', fontWeight: 600 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
