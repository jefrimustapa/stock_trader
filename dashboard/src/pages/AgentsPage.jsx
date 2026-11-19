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
import { sneatTokens } from '../theme';

export function AgentsPage() {
  const [loading, setLoading] = useState(true);
  const [runningSim, setRunningSim] = useState(false);
  const [activityData, setActivityData] = useState(null);
  const [selectedSymbolIndex, setSelectedSymbolIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [cancellingOrder, setCancellingOrder] = useState(null);

  const fetchActivity = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/agents/activity?limit=10');
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const data = await res.json();
      setActivityData(data);
      setErrorMsg(null);
    } catch (err) {
      console.error('[AgentsPage] Fetch error:', err);
      setErrorMsg('Gagal memuatkan aktiviti ejen dari Bridge: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActivity();
    const interval = setInterval(fetchActivity, 10000);
    return () => clearInterval(interval);
  }, [fetchActivity]);

  const handleTriggerSimulate = async () => {
    try {
      setRunningSim(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      const res = await fetch('/api/agents/simulate-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          force_simulation: true,
          mock_market_window: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.detail || `HTTP ${res.status}`);
      }
      setSuccessMsg(`Simulasi ${data.cycle_id} berjaya! ${data.summary?.orders_placed || 0} pesanan dijana.`);
      await fetchActivity();
      setSelectedSymbolIndex(0);
    } catch (err) {
      setErrorMsg('Ralat mencetuskan simulasi: ' + err.message);
    } finally {
      setRunningSim(false);
    }
  };

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
      setSuccessMsg(data.message || `Pesanan ${orderId} berjaya dibatalkan.`);
      await fetchActivity();
    } catch (err) {
      setErrorMsg('Ralat membatalkan pesanan: ' + err.message);
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

  return (
    <Box sx={{ width: '100%', py: 1 }}>
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PsychologyIcon sx={{ color: sneatTokens.primary.main, fontSize: 32 }} />
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Aktiviti Pasukan Ejen & Paper Trading
            </Typography>
            <Chip
              label="SIMULATE MODE"
              size="small"
              sx={{
                bgcolor: sneatTokens.info.soft,
                color: sneatTokens.info.main,
                fontWeight: 700,
                fontSize: '0.75rem',
              }}
            />
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Saluran Paip Keputusan Ejen L0 Screener → L1 Tariq & Nawwar → L2 Haziq → L3 Danial → L4 Moomoo OpenD
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            size="medium"
            startIcon={<RefreshIcon />}
            onClick={fetchActivity}
            disabled={loading || runningSim}
            sx={{ borderRadius: 2 }}
          >
            Segarkan
          </Button>
          <Button
            variant="contained"
            color="primary"
            size="medium"
            id="btn-run-simulation"
            startIcon={runningSim ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
            onClick={handleTriggerSimulate}
            disabled={runningSim}
            sx={{
              borderRadius: 2,
              px: 3,
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(105, 108, 255, 0.4)',
            }}
          >
            {runningSim ? 'Menjalankan Simulasi...' : 'Jalankan Simulasi Pipeline'}
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

      {/* Summary KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                JUMLAH KITARAN SIMULASI
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, my: 0.5, color: sneatTokens.primary.main }}>
                {stats.total_cycles || 0}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Kitaran terkini: {latestCycle?.cycle_id ? latestCycle.cycle_id.substring(0, 16) + '...' : '-'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                CALON KITARAN TERKINI
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, my: 0.5, color: sneatTokens.info.main }}>
                {latestCycle?.total_candidates || deliberations.length || 0}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                L1: {latestCycle?.passed_l1 ?? 0} | L2: {latestCycle?.passed_l2 ?? 0} | L3: {latestCycle?.passed_l3 ?? 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                PESANAN SIMULASI DIJANA
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, my: 0.5, color: sneatTokens.success.main }}>
                {orders.length}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Paper trading ke Moomoo OpenD
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                STATUS KESELAMATAN & RISIKO
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 0.5 }}>
                <CheckCircleIcon sx={{ color: sneatTokens.success.main, fontSize: 24 }} />
                <Typography variant="h6" sx={{ fontWeight: 700, color: sneatTokens.success.main }}>
                  8 HARD RULES
                </Typography>
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Penguatkuasaan deterministik aktif
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Visual Pipeline Stepper */}
      <Card sx={{ mb: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: 2.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
            Aliran Saluran Paip Keputusan Pasukan Ejen (Trading Pipeline Flow)
          </Typography>
          <Grid container spacing={1} alignItems="center">
            {/* L0 */}
            <Grid item xs={12} sm={2.4}>
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: 'action.hover',
                  border: '1px solid',
                  borderColor: 'divider',
                  textAlign: 'center',
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  L0 SCREENER
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                  Watchlist Dwi-Lorong
                </Typography>
                <Chip
                  label={`${latestCycle?.total_candidates || deliberations.length || 0} Calon`}
                  size="small"
                  sx={{ mt: 1, fontWeight: 600 }}
                />
              </Paper>
            </Grid>

            {/* L1 */}
            <Grid item xs={12} sm={2.4}>
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: sneatTokens.info.soft,
                  border: '1px solid',
                  borderColor: sneatTokens.info.main,
                  textAlign: 'center',
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.info.main }}>
                  L1 KECERDASAN
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                  Tariq & Nawwar
                </Typography>
                <Chip
                  label={`${latestCycle?.passed_l1 ?? 0} Lulus L1`}
                  size="small"
                  sx={{ mt: 1, fontWeight: 600, bgcolor: sneatTokens.info.main, color: '#fff' }}
                />
              </Paper>
            </Grid>

            {/* L2 */}
            <Grid item xs={12} sm={2.4}>
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: sneatTokens.primary.soft,
                  border: '1px solid',
                  borderColor: sneatTokens.primary.main,
                  textAlign: 'center',
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.primary.main }}>
                  L2 STRATEGI & PORTFOLIO
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                  Haziq (Lead)
                </Typography>
                <Chip
                  label={`${latestCycle?.passed_l2 ?? 0} Lulus L2`}
                  size="small"
                  sx={{ mt: 1, fontWeight: 600, bgcolor: sneatTokens.primary.main, color: '#fff' }}
                />
              </Paper>
            </Grid>

            {/* L3 */}
            <Grid item xs={12} sm={2.4}>
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: sneatTokens.warning.soft,
                  border: '1px solid',
                  borderColor: sneatTokens.warning.main,
                  textAlign: 'center',
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.warning.main }}>
                  L3 AUDIT RISIKO
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                  Danial & 8 Hard Rules
                </Typography>
                <Chip
                  label={`${latestCycle?.passed_l3 ?? 0} Lulus L3`}
                  size="small"
                  sx={{ mt: 1, fontWeight: 600, bgcolor: sneatTokens.warning.main, color: '#fff' }}
                />
              </Paper>
            </Grid>

            {/* L4 */}
            <Grid item xs={12} sm={2.4}>
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: sneatTokens.success.soft,
                  border: '1px solid',
                  borderColor: sneatTokens.success.main,
                  textAlign: 'center',
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.success.main }}>
                  L4 PELAKSANAAN
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                  Moomoo OpenD Paper
                </Typography>
                <Chip
                  label={`${latestCycle?.orders_placed ?? orders.length} Pesanan`}
                  size="small"
                  sx={{ mt: 1, fontWeight: 600, bgcolor: sneatTokens.success.main, color: '#fff' }}
                />
              </Paper>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Candidate Selector Tabs */}
      {deliberations.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'text.secondary' }}>
            PILIH CALON SAHAM UNTUK MENELITI LOG DELIBERASI EJEN:
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {deliberations.map((d, idx) => {
              const isSelected = idx === selectedSymbolIndex;
              const isApproved = d.final_decision?.includes('APPROVED');
              return (
                <Chip
                  key={d.symbol || idx}
                  label={`${d.symbol} (${d.stage_reached})`}
                  onClick={() => setSelectedSymbolIndex(idx)}
                  color={isSelected ? 'primary' : 'default'}
                  variant={isSelected ? 'filled' : 'outlined'}
                  icon={isApproved ? <CheckCircleIcon sx={{ fontSize: 16 }} /> : <CancelIcon sx={{ fontSize: 16 }} />}
                  sx={{
                    fontWeight: 600,
                    cursor: 'pointer',
                    borderColor: isSelected ? sneatTokens.primary.main : 'divider',
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
              Deliberasi Ejen untuk Saham: {selectedDelib.symbol}
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

                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    SKOR TEKNIKAL ($S_{'{tech}'}$)
                  </Typography>
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

                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, my: 1.5 }}>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Fasa Wyckoff</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedDelib.tariq?.wyckoff_phase || '-'}</Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Elliott / SMC FVG</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedDelib.tariq?.smc_fvg_confluence || '-'}</Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Zon Sokongan</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>${selectedDelib.tariq?.support_level || '-'}</Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Zon Rintangan</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>${selectedDelib.tariq?.resistance_level || '-'}</Typography>
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

                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    SKOR SENTIMEN TERNORMAL ($S_{'{sent_norm}'}$)
                  </Typography>
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

                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, my: 1.5 }}>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Skor Mentah</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {selectedDelib.nawwar?.s_sent_raw != null ? (selectedDelib.nawwar.s_sent_raw > 0 ? `+${selectedDelib.nawwar.s_sent_raw}` : selectedDelib.nawwar.s_sent_raw) : '-'} / ±100
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Label Sentimen</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{selectedDelib.nawwar?.sentiment_label || '-'}</Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Risiko Earnings (5 Hari)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: selectedDelib.nawwar?.earnings_within_5d ? 'error.main' : 'success.main' }}>
                        {selectedDelib.nawwar?.earnings_within_5d ? 'ADA RISIKO' : 'BERSIH'}
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Risiko Makro FOMC</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: selectedDelib.nawwar?.fomc_macro_risk ? 'error.main' : 'success.main' }}>
                        {selectedDelib.nawwar?.fomc_macro_risk ? 'BERISIKO' : 'BERSIH'}
                      </Typography>
                    </Box>
                  </Box>

                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                    {selectedDelib.nawwar?.notes}
                  </Typography>
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

                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    SKOR KOMPOSIT ($S_{'{total}'} = 0.65 \times S_{'{tech}'} + 0.35 \times S_{'{sent_norm}'}$)
                  </Typography>
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

                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, my: 1.5 }}>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Harga Entri</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>${selectedDelib.haziq?.entry_price?.toFixed(2)}</Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Stop Loss (1.5x ATR)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.main' }}>
                        ${selectedDelib.haziq?.stop_loss_price?.toFixed(2)}
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Sasaran TP1 (1:1.5 R:R)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>
                        ${selectedDelib.haziq?.take_profit_price?.toFixed(2)}
                      </Typography>
                    </Box>
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Saiz Posisi (1.5% Modal)</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {selectedDelib.haziq?.allocated_shares} unit (${selectedDelib.haziq?.position_value?.toFixed(2)})
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
                    MATRIKS AUDIT 8 HARD RULES:
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
            Tiada data deliberasi kitaran simulasi. Sila klik butang <strong>"Jalankan Simulasi Pipeline"</strong> untuk memulakan analisis ejen.
          </Typography>
        </Card>
      )}

      {/* Paper Trading Orders Table */}
      <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <ShoppingCartIcon sx={{ color: sneatTokens.success.main }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Jadual Transaksi Pesanan Simulasi Moomoo OpenD (Paper Trading Orders)
            </Typography>
          </Box>

          {orders.length > 0 ? (
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: 'action.hover' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>ORDER ID</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>SIMBOL</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>ARAH</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>KUANTITI</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>HARGA ENTRI</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>STOP LOSS</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>TAKE PROFIT</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>STATUS OPEND</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>CAP MASA</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>TINDAKAN</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.map((ord, oIdx) => {
                    const orderKey = ord.order_id || ord.client_order_id;
                    const isPendingOrSubmitted = ord.status === 'SUBMITTED' || ord.status === 'PENDING';
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
                          {isPendingOrSubmitted ? (
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
                                'Batal'
                              )}
                            </Button>
                          ) : (
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              -
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              Belum ada transaksi pesanan simulasi yang direkodkan dalam sesi ini.
            </Alert>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
