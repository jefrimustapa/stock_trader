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

  useEffect(() => {
    if (screenerConfig?.agent_orders_per_page) {
      setRowsPerPage(Number(screenerConfig.agent_orders_per_page));
    }
    if (screenerConfig?.pause_buying !== undefined) {
      setPauseBuying(Boolean(screenerConfig.pause_buying));
    }
  }, [screenerConfig?.agent_orders_per_page, screenerConfig?.pause_buying]);

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
              L1 -&gt; L4: Aktiviti Pasukan Ejen
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
            Saluran Paip Keputusan Ejen L0 Screener → L1 Tariq &amp; Nawwar → L2 Haziq → L3 Danial → L4 Moomoo OpenD
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
            Segarkan
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

      {/* Summary Header: Calon Kitaran Terkini (HOM-302 Clean Layout) */}
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
                  LATEST CYCLE CANDIDATES
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Typography variant="h4" sx={{ fontWeight: 800, color: sneatTokens.info.main }}>
                    {latestCycle?.total_candidates || deliberations.length || 0}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    stocks detected
                  </Typography>
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
                  label={`Kitaran: ${latestCycle.cycle_id.substring(0, 16)}...`}
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
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Aliran Saluran Paip Keputusan Pasukan Ejen (Trading Pipeline Flow)
            </Typography>
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
                borderColor: 'divider',
                textAlign: 'center',
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block' }}>
                L0 SCREENER
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>
                Watchlist Dwi-Lorong
              </Typography>
              <Chip
                label={`${latestCycle?.total_candidates || deliberations.length || 0} Calon`}
                size="small"
                sx={{ mt: 1, fontWeight: 700 }}
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
                L1 KECERDASAN
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>
                Tariq &amp; Nawwar
              </Typography>
              <Chip
                label={`${latestCycle?.passed_l1 ?? 0} Lulus L1`}
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
                L2 STRATEGI &amp; PORTFOLIO
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>
                Haziq (Lead)
              </Typography>
              <Chip
                label={`${latestCycle?.passed_l2 ?? 0} Lulus L2`}
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
                L3 AUDIT RISIKO
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.5 }}>
                Danial &amp; 8 Hard Rules
              </Typography>
              <Chip
                label={`${latestCycle?.passed_l3 ?? 0} Lulus L3`}
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
                L4 PELAKSANAAN
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
              return (
                <Chip
                  key={d.symbol || idx}
                  id={`chip-deliberation-${d.symbol}`}
                  label={d.symbol}
                  onClick={() => setSelectedSymbolIndex(idx)}
                  icon={isApproved ? <CheckCircleIcon sx={{ fontSize: 16 }} /> : <CancelIcon sx={{ fontSize: 16 }} />}
                  sx={{
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    py: 0.5,
                    px: 0.5,
                    borderRadius: 2,
                    ...(isApproved
                      ? {
                          bgcolor: isSelected ? sneatTokens.success.main : sneatTokens.success.soft,
                          color: isSelected ? '#ffffff' : sneatTokens.success.main,
                          borderColor: sneatTokens.success.main,
                          border: '1px solid',
                          boxShadow: isSelected ? '0 2px 8px rgba(113, 221, 55, 0.4)' : 'none',
                          '& .MuiChip-icon': {
                            color: isSelected ? '#ffffff' : sneatTokens.success.main,
                          },
                        }
                      : {
                          bgcolor: isSelected ? 'action.selected' : 'action.hover',
                          color: 'text.secondary',
                          borderColor: isSelected ? 'primary.main' : 'divider',
                          border: '1px solid',
                          '& .MuiChip-icon': {
                            color: 'text.disabled',
                          },
                        }),
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
                      label={selectedDelib.tariq?.passed ? 'LULUS (>=60)' : 'DITOLAK'}
                      size="small"
                      color={selectedDelib.tariq?.passed ? 'info' : 'error'}
                      sx={{ fontWeight: 700 }}
                    />
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      SKOR TEKNIKAL ($S_{'{tech}'}$)
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
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Fasa Wyckoff</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>{selectedDelib.tariq?.wyckoff_phase || '-'}</Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Elliott / SMC FVG</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>{selectedDelib.tariq?.smc_fvg_confluence || '-'}</Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Zon Sokongan</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>${selectedDelib.tariq?.support_level || '-'}</Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Zon Rintangan</Typography>
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
                      label={selectedDelib.nawwar?.passed ? 'LULUS (>=80)' : 'DITOLAK'}
                      size="small"
                      color={selectedDelib.nawwar?.passed ? 'primary' : 'error'}
                      sx={{ fontWeight: 700 }}
                    />
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      SKOR SENTIMEN TERNORMAL ($S_{'{sent_norm}'}$)
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
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Skor Mentah</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
                        {selectedDelib.nawwar?.s_sent_raw != null ? (selectedDelib.nawwar.s_sent_raw > 0 ? `+${selectedDelib.nawwar.s_sent_raw}` : selectedDelib.nawwar.s_sent_raw) : '-'} / ±100
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Label Sentimen</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>{selectedDelib.nawwar?.sentiment_label || '-'}</Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Risiko Earnings (5 Hari)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word', color: selectedDelib.nawwar?.earnings_within_5d ? 'error.main' : 'success.main' }}>
                        {selectedDelib.nawwar?.earnings_within_5d ? 'ADA RISIKO' : 'BERSIH'}
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Risiko Makro FOMC</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word', color: selectedDelib.nawwar?.fomc_macro_risk ? 'error.main' : 'success.main' }}>
                        {selectedDelib.nawwar?.fomc_macro_risk ? 'BERISIKO' : 'BERSIH'}
                      </Typography>
                    </Box>
                  </Box>

                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                    {selectedDelib.nawwar?.notes}
                  </Typography>

                  <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      Liputan Berita &amp; Sentimen Terkini:
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
                      label={selectedDelib.haziq?.passed ? 'PINTU TERBUKA (>=65)' : 'DITOLAK'}
                      size="small"
                      color={selectedDelib.haziq?.passed ? 'success' : 'error'}
                      sx={{ fontWeight: 700 }}
                    />
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      SKOR KOMPOSIT ($S_{'{total}'} = 0.65 \times S_{'{tech}'} + 0.35 \times S_{'{sent_norm}'}$)
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
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Sasaran TP1 (1:1.5 R:R)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word', color: 'success.main' }}>
                        ${selectedDelib.haziq?.take_profit_price?.toFixed(2)}
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Position Size (1.5% Capital)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                        {selectedDelib.haziq?.allocated_shares} unit (${selectedDelib.haziq?.position_value?.toFixed(2)})
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Asas Modal Efektif</Typography>
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
                      label={selectedDelib.danial?.passed ? '8/8 LULUS' : 'DITOLAK'}
                      size="small"
                      color={selectedDelib.danial?.passed ? 'success' : 'error'}
                      sx={{ fontWeight: 700 }}
                    />
                  </Box>

                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mb: 1, display: 'block' }}>
                    Semakan 8 Hard Rules (Matriks Audit Risiko):
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
            Tiada data deliberasi kitaran simulasi. Sistem saluran paip ejen beroperasi secara automatik di latar belakang mengikut jadual pasaran US (09:45 – 15:45 NY).
          </Typography>
        </Card>
      )}

      {/* Paper Trading Orders Table */}
      <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <ShoppingCartIcon sx={{ color: sneatTokens.success.main }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Moomoo OpenD Simulated Order Transactions Table (Paper Trading Orders)
            </Typography>
          </Box>

          {orders.length > 0 ? (
            <>
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, maxWidth: '100%', overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>ORDER ID</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>SIMBOL</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>ARAH</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>KUANTITI</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>ENTRY PRICE</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>STOP LOSS</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>TAKE PROFIT</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>OPEND STATUS</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>CAP MASA</TableCell>
                      <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>TINDAKAN</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {orders.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((ord, oIdx) => {
                      const orderKey = ord.order_id || ord.client_order_id;
                      const isCancellable =
                        ord.status === 'SUBMITTED' ||
                        ord.status === 'PENDING' ||
                        ord.status === 'SUBMITTED_PAPER_SIM';
                      return (
                        <TableRow key={ord.client_order_id || oIdx} hover>
                          <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                            {ord.order_id || ord.client_order_id?.substring(0, 8)}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>{ord.symbol}</TableCell>
                          <TableCell>
                            <Chip
                              label={ord.order_side || 'BUY'}
                              size="small"
                              sx={{
                                fontWeight: 700,
                                bgcolor: sneatTokens.success.soft,
                                color: sneatTokens.success.main,
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{ord.quantity} unit</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>${Number(ord.entry_price || 0).toFixed(2)}</TableCell>
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
                                {ord.status === 'CANCELLED' ? 'Dibatalkan' : (ord.status === 'FILLED' ? 'Selesai' : '-')}
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
                count={orders.length}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={(event, newPage) => setPage(newPage)}
                onRowsPerPageChange={(event) => {
                  setRowsPerPage(parseInt(event.target.value, 10));
                  setPage(0);
                }}
                labelRowsPerPage="Baris per halaman:"
                labelDisplayedRows={({ from, to, count }) => `${from}–${to} of ${count !== -1 ? count : `more than ${to}`}`}
                sx={{ borderTop: '1px solid', borderColor: 'divider' }}
              />
            </>
          ) : (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              No simulated order transactions recorded in this session yet.
            </Alert>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
