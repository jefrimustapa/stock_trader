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

  // 30-Day K-Line Quota KPI
  const quota = watchlistData.quota_status || {};
  const klineUsed = quota.kline_30d_used !== undefined ? quota.kline_30d_used : 0;
  const klineRemaining = quota.kline_30d_remaining !== undefined ? quota.kline_30d_remaining : 100;
  const klinePercent = Math.min(100, Math.max(0, (klineUsed / 100) * 100));

  return (
    <Box id="overview" sx={{ mb: 4 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Ringkasan &amp; Status Operasi
      </Typography>

      <Grid container spacing={2.5}>
        {/* Card 1: OpenD Gateway */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: '100%', position: 'relative' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '8px',
                    backgroundColor: isOpendConnected ? sneatTokens.success.soft : sneatTokens.warning.soft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isOpendConnected ? sneatTokens.success.main : sneatTokens.warning.main,
                  }}
                >
                  <HubIcon sx={{ fontSize: 24 }} />
                </Box>
                <Chip
                  size="small"
                  label={trdEnv}
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.7rem',
                    backgroundColor: trdEnv === 'REAL' ? sneatTokens.error.soft : sneatTokens.info.soft,
                    color: trdEnv === 'REAL' ? sneatTokens.error.main : sneatTokens.info.main,
                  }}
                />
              </Box>

              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                Gerbang OpenD Moomoo
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: isOpendConnected ? sneatTokens.success.main : sneatTokens.warning.main }}>
                {opendStatus}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                Port 11111 (API) &bull; 22222 (Telnet)
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 2: Baki Akaun & Ekuiti */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '8px',
                    backgroundColor: sneatTokens.primary.soft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: sneatTokens.primary.main,
                  }}
                >
                  <AccountBalanceWalletIcon sx={{ fontSize: 24 }} />
                </Box>
                <Chip
                  size="small"
                  label={`Acc: ${activeAccId}`}
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.7rem',
                    backgroundColor: sneatTokens.secondary.soft,
                    color: 'text.primary',
                  }}
                />
              </Box>

              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                Baki Tunai &amp; Jumlah Ekuiti
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>
                {cashBalance}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                Jumlah Ekuiti: <strong>{totalEquity}</strong>
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 3: Sentinel L4 Engine */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '8px',
                    backgroundColor: isSentinelActive ? sneatTokens.success.soft : sneatTokens.secondary.soft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isSentinelActive ? sneatTokens.success.main : sneatTokens.secondary.main,
                  }}
                >
                  <ShieldIcon sx={{ fontSize: 24 }} />
                </Box>
                <Chip
                  size="small"
                  label={`${managedPositions} Posisi`}
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.7rem',
                    backgroundColor: sneatTokens.info.soft,
                    color: sneatTokens.info.main,
                  }}
                />
              </Box>

              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                Pengawasan Sentinel L4
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5, color: isSentinelActive ? sneatTokens.success.main : 'text.primary' }}>
                {sentinelStatus}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                Circuit Breaker &amp; Risk Guard
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 4: Penjejak Kuota K-Line */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '8px',
                    backgroundColor: klinePercent > 80 ? sneatTokens.error.soft : sneatTokens.info.soft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: klinePercent > 80 ? sneatTokens.error.main : sneatTokens.info.main,
                  }}
                >
                  <QueryStatsIcon sx={{ fontSize: 24 }} />
                </Box>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  {klineUsed} / 100 Digunakan
                </Typography>
              </Box>

              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                Kuota API K-Line 30-Hari
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>
                {klineRemaining} Baki
              </Typography>
              <Box sx={{ mt: 1.5, width: '100%' }}>
                <LinearProgress
                  variant="determinate"
                  value={klinePercent}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: theme => theme.palette.divider,
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: klinePercent > 80 ? sneatTokens.error.main : sneatTokens.info.main,
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
