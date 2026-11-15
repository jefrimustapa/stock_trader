import React from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
  Chip,
} from '@mui/material';
import HubIcon from '@mui/icons-material/Hub';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ShieldIcon from '@mui/icons-material/Shield';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { sneatTokens } from '../theme';

export function KpiCards({ statusData, dataPayload }) {
  const bridge = statusData?.bridge || {};
  const watchlistData = dataPayload?.watchlist || {};
  const sentinelData = dataPayload?.sentinel || {};

  // OpenD Gateway KPI
  const opendStatus = bridge.opend_status || bridge.status || 'UNKNOWN';
  const trdEnv = bridge.trd_env || 'SIMULATE';
  const isOpendConnected = String(opendStatus).toUpperCase().includes('CONNECT') && !String(opendStatus).toUpperCase().includes('ERROR');

  // Moomoo Account Balance KPI
  const cashBalance = bridge.cash_balance !== undefined ? `$${Number(bridge.cash_balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A';
  const totalEquity = bridge.total_equity !== undefined ? `$${Number(bridge.total_equity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A';
  const availableAccs = bridge.account_info?.available_accounts || bridge.available_accounts || bridge.accounts || [];
  const activeAccId = String(bridge.account_id || bridge.active_acc_id || availableAccs[0]?.account_id || availableAccs[0]?.acc_id || 'SIMULATED-ACC');

  // Sentinel L4 Engine KPI
  const sentinelStatus = sentinelData.status || 'OFFLINE';
  const managedPositions = sentinelData.managed_positions || 0;
  const isSentinelActive = sentinelStatus === 'ACTIVE';

  // 30-Day K-Line Quota KPI (Rekod Dalaman Screener, Anggaran)
  const quota = watchlistData.quota_status;
  const hasKlineData = Boolean(quota && typeof quota.kline_30d_remaining === 'number');
  const klineUsed = hasKlineData ? quota.kline_30d_used : 0;
  const klineRemaining = hasKlineData ? quota.kline_30d_remaining : '-';
  const klinePercent = hasKlineData ? Math.min(100, Math.max(0, ((klineUsed || 0) / 100) * 100)) : 0;

  const cardActionSx = {
    height: '100%',
    cursor: 'pointer',
    transition: 'all 0.2s ease-in-out',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 2.5,
    backgroundColor: 'background.paper',
    '&:hover': {
      transform: 'translateY(-3px)',
      boxShadow: '0 8px 24px rgba(105, 108, 255, 0.12)',
      borderColor: 'primary.main',
    },
  };

  return (
    <Box id="overview">
      <Grid container spacing={2.5}>
        {/* Card 1: OpenD Gateway -> navigates to #/opend */}
        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={cardActionSx}
            onClick={() => { window.location.hash = '#/opend'; }}
            title="Klik untuk ke halaman Pengurusan OpenD"
          >
            <CardContent sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', '&:last-child': { pb: 2.5 } }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: '8px',
                      backgroundColor: isOpendConnected ? sneatTokens.success.soft : sneatTokens.warning.soft,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isOpendConnected ? sneatTokens.success.main : sneatTokens.warning.main,
                    }}
                  >
                    <HubIcon sx={{ fontSize: 22 }} />
                  </Box>
                  <Chip
                    size="small"
                    label={trdEnv}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      borderRadius: 1.5,
                      backgroundColor: trdEnv === 'REAL' ? sneatTokens.error.soft : sneatTokens.info.soft,
                      color: trdEnv === 'REAL' ? sneatTokens.error.main : sneatTokens.info.main,
                    }}
                  />
                </Box>

                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.85rem' }}>
                  Gerbang OpenD Moomoo
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: isOpendConnected ? sneatTokens.success.main : sneatTokens.warning.main }}>
                  {opendStatus}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  Port 11111 (API) &bull; 22222 (Telnet)
                </Typography>
                <ArrowForwardIosIcon sx={{ fontSize: 11, color: 'text.secondary' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 2: Baki Akaun & Ekuiti -> navigates to #/opend */}
        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={cardActionSx}
            onClick={() => { window.location.hash = '#/opend'; }}
            title="Klik untuk ke halaman Pengurusan OpenD & Akaun"
          >
            <CardContent sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', '&:last-child': { pb: 2.5 } }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: '8px',
                      backgroundColor: sneatTokens.primary.soft,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: sneatTokens.primary.main,
                    }}
                  >
                    <AccountBalanceWalletIcon sx={{ fontSize: 22 }} />
                  </Box>
                  <Chip
                    size="small"
                    label={`Acc: ${activeAccId}`}
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.7rem',
                      borderRadius: 1.5,
                      backgroundColor: sneatTokens.secondary.soft,
                      color: 'text.primary',
                    }}
                  />
                </Box>

                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.85rem' }}>
                  Baki Tunai &amp; Jumlah Ekuiti
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>
                  {cashBalance}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  Jumlah Ekuiti: <strong>{totalEquity}</strong>
                </Typography>
                <ArrowForwardIosIcon sx={{ fontSize: 11, color: 'text.secondary' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 3: Sentinel L4 Engine -> navigates to #/funnel */}
        <Grid item xs={12} sm={6} md={3}>
          <Card
            sx={cardActionSx}
            onClick={() => { window.location.hash = '#/funnel'; }}
            title="Klik untuk ke paparan Corong Saringan & Sentinel"
          >
            <CardContent sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', '&:last-child': { pb: 2.5 } }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: '8px',
                      backgroundColor: isSentinelActive ? sneatTokens.success.soft : sneatTokens.secondary.soft,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isSentinelActive ? sneatTokens.success.main : sneatTokens.secondary.main,
                    }}
                  >
                    <ShieldIcon sx={{ fontSize: 22 }} />
                  </Box>
                  <Chip
                    size="small"
                    label={`${managedPositions} Posisi`}
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.7rem',
                      borderRadius: 1.5,
                      backgroundColor: sneatTokens.info.soft,
                      color: sneatTokens.info.main,
                    }}
                  />
                </Box>

                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.85rem' }}>
                  Pengawasan Sentinel L4
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: isSentinelActive ? sneatTokens.success.main : 'text.primary' }}>
                  {sentinelStatus}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  Circuit Breaker &amp; Risk Guard
                </Typography>
                <ArrowForwardIosIcon sx={{ fontSize: 11, color: 'text.secondary' }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 4: Penjejak Kuota K-Line -> navigates to #/quota */}
        <Grid item xs={12} sm={6} md={3}>
          <Card
            id="kpi-card-kline-quota"
            sx={cardActionSx}
            onClick={() => { window.location.hash = '#/quota'; }}
            title="Klik untuk lihat perincian kuota K-Line 30-hari (rekod dalaman screener, anggaran)"
          >
            <CardContent sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', '&:last-child': { pb: 2.5 } }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: '8px',
                      backgroundColor: (hasKlineData && klinePercent > 80) ? sneatTokens.error.soft : sneatTokens.info.soft,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: (hasKlineData && klinePercent > 80) ? sneatTokens.error.main : sneatTokens.info.main,
                    }}
                  >
                    <QueryStatsIcon sx={{ fontSize: 22 }} />
                  </Box>
                  <Chip
                    size="small"
                    label={hasKlineData ? `${klineUsed} / 100 Direkod` : 'Tiada Data'}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      borderRadius: 1.5,
                      backgroundColor: (hasKlineData && klinePercent > 80) ? sneatTokens.error.soft : sneatTokens.secondary.soft,
                      color: (hasKlineData && klinePercent > 80) ? sneatTokens.error.main : 'text.secondary',
                    }}
                  />
                </Box>

                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.85rem' }}>
                  Kuota API K-Line (Rekod Dalaman Screener)
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>
                  {hasKlineData ? `${klineRemaining} Baki` : '-'}
                </Typography>
              </Box>

              <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                    {hasKlineData ? 'Anggaran Digunakan' : 'Rekod Screener'}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.72rem' }}>
                    {hasKlineData ? `${Math.round(klinePercent)}%` : 'Tiada data'}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={hasKlineData ? klinePercent : 0}
                  sx={{
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: theme => theme.palette.divider,
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: (hasKlineData && klinePercent > 80) ? sneatTokens.error.main : sneatTokens.info.main,
                      borderRadius: 3,
                    },
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
