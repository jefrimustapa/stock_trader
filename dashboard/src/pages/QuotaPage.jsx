import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  TextField,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  InputAdornment,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import PieChartIcon from '@mui/icons-material/PieChart';
import InventoryIcon from '@mui/icons-material/Inventory';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import { sneatTokens } from '../theme';

export function QuotaPage({ initialQuotaData = null }) {
  const [quotaData, setQuotaData] = useState(initialQuotaData);
  const [loading, setLoading] = useState(!initialQuotaData);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchQuotaData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/screener/kline-quota');
      if (!res.ok) {
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      setQuotaData(data);
    } catch (err) {
      console.error('[QuotaPage] Failed to load K-line quota:', err);
      setError(err.message || 'Failed to connect to K-line quota endpoint.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialQuotaData) {
      fetchQuotaData();
    }
  }, [fetchQuotaData, initialQuotaData]);

  const isDbMissing = Boolean(quotaData && quotaData.db_exists === false);
  const moomooQuota = quotaData?.moomoo_quota;
  const isMoomooConnected = Boolean(
    moomooQuota &&
    moomooQuota.status === 'HEALTHY' &&
    moomooQuota.connected &&
    typeof moomooQuota.remain_quota === 'number'
  );
  const realRemain = isMoomooConnected ? moomooQuota.remain_quota : null;
  const realUsed = isMoomooConnected ? moomooQuota.used_quota : null;
  const realTotal = isMoomooConnected ? (moomooQuota.total_quota ?? 100) : 100;
  const realPercent = isMoomooConnected && realTotal > 0 ? Number(((realUsed / realTotal) * 100).toFixed(1)) : null;

  // Real Moomoo OpenAPI counter list (fail-closed: empty when OpenD unavailable)
  const rawCounters = isMoomooConnected
    ? (Array.isArray(moomooQuota?.detail_list)
        ? moomooQuota.detail_list
        : (Array.isArray(quotaData?.moomoo_counters) ? quotaData.moomoo_counters : []))
    : [];

  const formatMoomooError = (rawErr) => {
    if (!rawErr) return 'Moomoo OpenD unreachable';
    const str = String(rawErr);
    if (/ECONNREFUSED|Connection refused|not reachable/i.test(str)) {
      return 'Moomoo OpenD unreachable';
    }
    if (/ETIMEDOUT|timeout/i.test(str)) {
      return 'Connection to Moomoo OpenD timed out';
    }
    if (/not authenticated|WAIT_LOGIN/i.test(str)) {
      return 'OpenD gateway not logged in to broker';
    }
    return str;
  };

  const filteredCounters = rawCounters.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toUpperCase();
    const sym = (item.symbol || item.code || '').toUpperCase();
    const name = (item.name || '').toUpperCase();
    return sym.includes(q) || name.includes(q);
  });

  const formatDate = (isoStr) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch (e) {
      return isoStr;
    }
  };

  const getStatusColor = (status, percent) => {
    if (!isMoomooConnected) return { bg: sneatTokens.error.soft, text: sneatTokens.error.main, label: 'UNAVAILABLE' };
    if (percent >= 90) return { bg: sneatTokens.error.soft, text: sneatTokens.error.main, label: 'CRITICAL' };
    if (percent >= 75) return { bg: sneatTokens.warning.soft, text: sneatTokens.warning.main, label: 'WARNING' };
    return { bg: sneatTokens.success.soft, text: sneatTokens.success.main, label: 'HEALTHY' };
  };

  const statusBadge = getStatusColor(quotaData?.status, realPercent ?? 0);

  return (
    <Box id="quota-page" sx={{ width: '100%', mb: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: '8px',
                backgroundColor: sneatTokens.primary.soft,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: sneatTokens.primary.main,
              }}
            >
              <QueryStatsIcon sx={{ fontSize: 22 }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: -0.5 }}>
              30-Day K-Line Quota Usage
            </Typography>
            <Chip
              size="small"
              label={isMoomooConnected ? `Quota Limit: ${realTotal} Symbols` : 'Quota Limit: -'}
              sx={{
                fontWeight: 700,
                fontSize: '0.72rem',
                backgroundColor: isMoomooConnected ? sneatTokens.primary.soft : sneatTokens.secondary.soft,
                color: isMoomooConnected ? sneatTokens.primary.main : 'text.secondary',
              }}
            />
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, ml: 6 }}>
            Monitoring remaining and used real Moomoo OpenAPI K-Line quota.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            id="btn-refresh-quota"
            variant="outlined"
            size="small"
            startIcon={<RestartAltIcon />}
            onClick={fetchQuotaData}
            disabled={loading}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Real Moomoo OpenAPI Quota Alert (Only shown when unavailable / error, green banner removed per HOM-239) */}
      {moomooQuota && !isMoomooConnected ? (
        <Alert
          id="banner-moomoo-quota-unavailable"
          severity="warning"
          icon={<WarningAmberIcon sx={{ fontSize: 20 }} />}
          sx={{
            mb: 2,
            borderRadius: 2,
            fontSize: '0.82rem',
            backgroundColor: sneatTokens.warning.soft,
            color: 'text.primary',
            '& .MuiAlert-icon': { color: sneatTokens.warning.main },
          }}
        >
          <Typography variant="body2" sx={{ fontSize: '0.82rem', fontWeight: 700, display: 'inline' }}>
            Real Moomoo OpenAPI Quota:&nbsp;
          </Typography>
          <Chip
            size="small"
            label="UNAVAILABLE"
            sx={{
              fontWeight: 700,
              fontSize: '0.68rem',
              mr: 1,
              backgroundColor: sneatTokens.error.soft,
              color: sneatTokens.error.main,
            }}
          />
          Real Remaining: <strong>-</strong> ({formatMoomooError(moomooQuota?.error)}). Under fail-closed rules, remaining quota is unavailable.
        </Alert>
      ) : null}

      {/* Table Reference Note Banner */}
      <Alert
        severity="info"
        icon={<QueryStatsIcon sx={{ fontSize: 20 }} />}
        sx={{
          mb: 3,
          borderRadius: 2,
          fontSize: '0.82rem',
          backgroundColor: sneatTokens.info.soft,
          color: 'text.primary',
          '& .MuiAlert-icon': { color: sneatTokens.info.main },
        }}
      >
        <Typography variant="body2" sx={{ fontSize: '0.82rem', fontWeight: 600, display: 'inline' }}>
          Quota &amp; Symbol Details:&nbsp;
        </Typography>
        Summary cards and table below list real symbols with historical K-lines retrieved from Moomoo OpenAPI (30-day rolling window).
      </Alert>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3, borderRadius: 2 }}
          action={
            <Button color="inherit" size="small" onClick={fetchQuotaData}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* 4 Sneat KPI Summary Cards */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {/* Card 1: Baki Kuota Sebenar */}
        <Grid item xs={12} sm={6} md={3}>
          <Card id="kpi-quota-remaining" sx={{ height: '100%', borderRadius: 2.5, boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
            <CardContent sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', '&:last-child': { pb: 2.5 } }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: '8px',
                      backgroundColor: isMoomooConnected ? sneatTokens.info.soft : sneatTokens.secondary.soft,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isMoomooConnected ? sneatTokens.info.main : 'text.secondary',
                    }}
                  >
                    <InventoryIcon sx={{ fontSize: 22 }} />
                  </Box>
                  <Chip
                    size="small"
                    label={isMoomooConnected ? `${realRemain} Remaining` : 'Unavailable'}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      borderRadius: 1.5,
                      backgroundColor: isMoomooConnected ? sneatTokens.info.soft : sneatTokens.error.soft,
                      color: isMoomooConnected ? sneatTokens.info.main : sneatTokens.error.main,
                    }}
                  />
                </Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.85rem' }}>
                  Real Remaining Quota (Moomoo)
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                  {isMoomooConnected ? `${realRemain} / ${realTotal}` : '-'}
                </Typography>
              </Box>

              <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                    Available Capacity
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.72rem' }}>
                    {isMoomooConnected ? `${100 - Math.round(realPercent)}%` : 'Unavailable'}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={isMoomooConnected ? Math.max(0, 100 - realPercent) : 0}
                  sx={{
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: (theme) => theme.palette.divider,
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: sneatTokens.info.main,
                      borderRadius: 3,
                    },
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 2: Kuota Terpakai Moomoo */}
        <Grid item xs={12} sm={6} md={3}>
          <Card id="kpi-quota-used" sx={{ height: '100%', borderRadius: 2.5, boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
            <CardContent sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', '&:last-child': { pb: 2.5 } }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: '8px',
                      backgroundColor: isMoomooConnected ? sneatTokens.primary.soft : sneatTokens.secondary.soft,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isMoomooConnected ? sneatTokens.primary.main : 'text.secondary',
                    }}
                  >
                    <PieChartIcon sx={{ fontSize: 22 }} />
                  </Box>
                  <Chip
                    size="small"
                    label={isMoomooConnected ? `${realUsed} / ${realTotal} Used` : 'Unavailable'}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      borderRadius: 1.5,
                      backgroundColor: isMoomooConnected ? sneatTokens.primary.soft : sneatTokens.error.soft,
                      color: isMoomooConnected ? sneatTokens.primary.main : sneatTokens.error.main,
                    }}
                  />
                </Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.85rem' }}>
                  Used Quota (Moomoo)
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                  {isMoomooConnected ? `${realUsed} Symbols` : '-'}
                </Typography>
              </Box>

              <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                    30-Day Rolling Window
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.72rem' }}>
                    {isMoomooConnected ? `Max ${realTotal}` : '-'}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={isMoomooConnected ? realPercent : 0}
                  sx={{
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: (theme) => theme.palette.divider,
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: realPercent > 80 ? sneatTokens.error.main : sneatTokens.primary.main,
                      borderRadius: 3,
                    },
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 3: Peratus Penggunaan */}
        <Grid item xs={12} sm={6} md={3}>
          <Card id="kpi-quota-percent" sx={{ height: '100%', borderRadius: 2.5, boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
            <CardContent sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', '&:last-child': { pb: 2.5 } }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: '8px',
                      backgroundColor: isMoomooConnected ? (realPercent > 80 ? sneatTokens.error.soft : sneatTokens.warning.soft) : sneatTokens.secondary.soft,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isMoomooConnected ? (realPercent > 80 ? sneatTokens.error.main : sneatTokens.warning.main) : 'text.secondary',
                    }}
                  >
                    <ShowChartIcon sx={{ fontSize: 22 }} />
                  </Box>
                  <Chip
                    size="small"
                    label={isMoomooConnected ? `${realPercent}%` : '-'}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      borderRadius: 1.5,
                      backgroundColor: isMoomooConnected ? (realPercent > 80 ? sneatTokens.error.soft : sneatTokens.warning.soft) : sneatTokens.secondary.soft,
                      color: isMoomooConnected ? (realPercent > 80 ? sneatTokens.error.main : sneatTokens.warning.main) : 'text.secondary',
                    }}
                  />
                </Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.85rem' }}>
                  Quota Utilization Rate
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                  {isMoomooConnected ? `${realPercent}%` : '-'}
                </Typography>
              </Box>

              <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                    Warning Thresholds (75% / 90%)
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.72rem' }}>
                    {isMoomooConnected ? (realPercent >= 90 ? 'High' : (realPercent >= 75 ? 'Moderate' : 'Low')) : '-'}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={isMoomooConnected ? realPercent : 0}
                  sx={{
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: (theme) => theme.palette.divider,
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: realPercent > 80 ? sneatTokens.error.main : (realPercent > 70 ? sneatTokens.warning.main : sneatTokens.success.main),
                      borderRadius: 3,
                    },
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 4: Status Kuota Moomoo */}
        <Grid item xs={12} sm={6} md={3}>
          <Card id="kpi-quota-status" sx={{ height: '100%', borderRadius: 2.5, boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
            <CardContent sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', '&:last-child': { pb: 2.5 } }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: '8px',
                      backgroundColor: statusBadge.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: statusBadge.text,
                    }}
                  >
                    {!isMoomooConnected ? (
                      <ErrorOutlineIcon sx={{ fontSize: 22 }} />
                    ) : realPercent >= 90 ? (
                      <ErrorOutlineIcon sx={{ fontSize: 22 }} />
                    ) : realPercent >= 75 ? (
                      <WarningAmberIcon sx={{ fontSize: 22 }} />
                    ) : (
                      <CheckCircleOutlineIcon sx={{ fontSize: 22 }} />
                    )}
                  </Box>
                  <Chip
                    size="small"
                    label={statusBadge.label}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      borderRadius: 1.5,
                      backgroundColor: statusBadge.bg,
                      color: statusBadge.text,
                    }}
                  />
                </Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.85rem' }}>
                  Moomoo Quota Status
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: statusBadge.text }}>
                  {statusBadge.label}
                </Typography>
              </Box>

              <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {isMoomooConnected ? 'Status: OpenD Gateway Active' : 'Status: OpenD Gateway Unavailable'}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Search and Table Card */}
      <Card sx={{ borderRadius: 2.5, boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2.5 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Retrieved Symbols List (Moomoo OpenAPI)
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                List of symbols with historical K-lines retrieved from Moomoo OpenAPI (30-day rolling window).
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <TextField
                id="input-search-quota-symbol"
                size="small"
                placeholder="Search symbol (e.g. MY.1155)..."
                value={searchQuery}
                disabled={!isMoomooConnected}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  width: { xs: '100%', sm: 240 },
                  '& .MuiOutlinedInput-root': { borderRadius: 2 },
                }}
              />
              <Chip
                id="chip-quota-counter-count"
                size="small"
                label={isMoomooConnected ? `${filteredCounters.length} / ${rawCounters.length} Symbols Retrieved` : 'Unavailable'}
                sx={{
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  borderRadius: 1.5,
                  backgroundColor: isMoomooConnected ? sneatTokens.primary.soft : sneatTokens.secondary.soft,
                  color: isMoomooConnected ? sneatTokens.primary.main : 'text.secondary',
                }}
              />
            </Box>
          </Box>

          {loading && !quotaData ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8 }}>
              <CircularProgress size={36} color="primary" />
              <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
                Loading K-line quota records...
              </Typography>
            </Box>
          ) : !isMoomooConnected ? (
            <Box
              id="quota-opend-unavailable"
              sx={{
                p: 4,
                textAlign: 'center',
                border: '1px dashed',
                borderColor: sneatTokens.error.main,
                borderRadius: 2,
                backgroundColor: sneatTokens.error.soft,
              }}
            >
              <ErrorOutlineIcon sx={{ fontSize: 48, color: sneatTokens.error.main, mb: 1 }} />
              <Typography variant="body1" sx={{ fontWeight: 700, color: sneatTokens.error.main }}>
                Moomoo Symbol Data Unavailable
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, maxWidth: 500, mx: 'auto' }}>
                Connection to Moomoo OpenD gateway is not active ({formatMoomooError(moomooQuota?.error)}). K-line symbol list from Moomoo OpenAPI cannot be loaded (not a false empty list).
              </Typography>
            </Box>
          ) : rawCounters.length === 0 ? (
            <Box
              id="quota-table-empty"
              sx={{
                p: 4,
                textAlign: 'center',
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 2,
              }}
            >
              <InventoryIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1, opacity: 0.6 }} />
              <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                No Symbols Retrieved (0 Symbols)
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, maxWidth: 500, mx: 'auto' }}>
                No historical K-lines retrieved from Moomoo OpenAPI within this 30-day window (0 / {realTotal} quota used).
              </Typography>
            </Box>
          ) : (
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                overflowX: 'auto',
              }}
            >
              <Table id="table-kline-quota" size="small" aria-label="K-Line Quota Table">
                <TableHead sx={{ backgroundColor: (theme) => theme.palette.mode === 'dark' ? '#2b2c40' : '#f5f5f9' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', py: 1.5 }}>SYMBOL</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', py: 1.5 }}>REQUEST TIME</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', py: 1.5 }}>EXPIRATION DATE (+30 DAYS)</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', py: 1.5 }}>DAYS REMAINING</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.78rem', py: 1.5 }}>WATCHLIST STATUS</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredCounters.map((row) => {
                    const isExpired = row.status === 'EXPIRED' || (row.days_remaining !== null && row.days_remaining <= 0);
                    const isInWatchlist = Boolean(row.in_watchlist);
                    const sym = row.symbol || row.code || '-';
                    return (
                      <TableRow
                        key={sym + (row.request_time || '')}
                        hover
                        sx={{
                          '&:last-child td, &:last-child th': { border: 0 },
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        <TableCell component="th" scope="row" sx={{ py: 1.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              label={sym}
                              size="small"
                              sx={{
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                borderRadius: 1.5,
                                backgroundColor: isExpired ? sneatTokens.secondary.soft : sneatTokens.primary.soft,
                                color: isExpired ? 'text.secondary' : sneatTokens.primary.main,
                              }}
                            />
                            {row.name && row.name !== 'N/A' && (
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                                {row.name}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary', py: 1.5 }}>
                          {row.request_time ? (
                            <Tooltip title={`Request Time: ${row.request_time}`} arrow>
                              <span>{formatDate(row.request_time)}</span>
                            </Tooltip>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary', py: 1.5 }}>
                          {row.expires_at ? (
                            <Tooltip title={`Expiration Date: ${row.expires_at}`} arrow>
                              <span>{formatDate(row.expires_at)}</span>
                            </Tooltip>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell sx={{ py: 1.5 }}>
                          {row.days_remaining !== null && row.days_remaining !== undefined ? (
                            <Chip
                              icon={<ScheduleIcon sx={{ fontSize: '14px !important' }} />}
                              label={isExpired ? 'Expired' : `${row.days_remaining} Days Left`}
                              size="small"
                              sx={{
                                fontWeight: 600,
                                fontSize: '0.72rem',
                                borderRadius: 1.5,
                                backgroundColor: isExpired
                                  ? sneatTokens.secondary.soft
                                  : (row.days_remaining <= 3 ? sneatTokens.warning.soft : sneatTokens.info.soft),
                                color: isExpired
                                  ? 'text.secondary'
                                  : (row.days_remaining <= 3 ? sneatTokens.warning.main : sneatTokens.info.main),
                              }}
                            />
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell align="center" sx={{ py: 1.5 }}>
                          <Chip
                            label={isInWatchlist ? 'IN WATCHLIST' : 'REMOVED'}
                            size="small"
                            sx={{
                              fontWeight: 700,
                              fontSize: '0.7rem',
                              borderRadius: 1.5,
                              backgroundColor: isInWatchlist ? sneatTokens.success.soft : sneatTokens.secondary.soft,
                              color: isInWatchlist ? sneatTokens.success.main : 'text.secondary',
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
