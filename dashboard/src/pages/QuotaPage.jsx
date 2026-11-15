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
        throw new Error(`Ralat pelayan: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      setQuotaData(data);
    } catch (err) {
      console.error('[QuotaPage] Ralat memuatkan kuota K-line:', err);
      setError(err.message || 'Gagal menyambung ke endpoint kuota K-line.');
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
  const isMoomooConnected = Boolean(moomooQuota && moomooQuota.status === 'HEALTHY' && moomooQuota.connected);
  const totalQuota = quotaData?.total_quota ?? 100;
  const usedQuota = quotaData?.used_quota ?? 0;
  const remainingQuota = quotaData?.remaining_quota ?? (totalQuota - usedQuota);
  const percentUsed = quotaData?.percent_used ?? Number(((usedQuota / totalQuota) * 100).toFixed(1));
  const rawSymbols = Array.isArray(quotaData?.symbols) ? quotaData.symbols : [];

  const filteredSymbols = rawSymbols.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toUpperCase();
    return (item.symbol || '').toUpperCase().includes(q);
  });

  const formatDate = (isoStr) => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleString('ms-MY', {
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
    if (status === 'CRITICAL' || percent >= 90) return { bg: sneatTokens.error.soft, text: sneatTokens.error.main, label: 'KRITIKAL' };
    if (status === 'WARNING' || percent >= 75) return { bg: sneatTokens.warning.soft, text: sneatTokens.warning.main, label: 'AMARAN' };
    return { bg: sneatTokens.success.soft, text: sneatTokens.success.main, label: 'SIHAT' };
  };

  const statusBadge = getStatusColor(quotaData?.status, percentUsed);

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
              Penggunaan Kuota K-Line 30-Hari
            </Typography>
            <Chip
              size="small"
              label={`Anggaran Had: ${totalQuota} Simbol`}
              sx={{
                fontWeight: 700,
                fontSize: '0.72rem',
                backgroundColor: sneatTokens.primary.soft,
                color: sneatTokens.primary.main,
              }}
            />
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, ml: 6 }}>
            Kuota K-Line (rekod dalaman screener, anggaran). Mungkin berbeza daripada baki sebenar Moomoo.
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
            Muat Semula
          </Button>
        </Box>
      </Box>

      {/* Real Moomoo OpenAPI Quota Banner */}
      {moomooQuota ? (
        isMoomooConnected ? (
          <Alert
            id="banner-moomoo-quota-active"
            severity="success"
            icon={<CheckCircleOutlineIcon sx={{ fontSize: 20 }} />}
            sx={{
              mb: 2,
              borderRadius: 2,
              fontSize: '0.82rem',
              backgroundColor: sneatTokens.success.soft,
              color: 'text.primary',
              '& .MuiAlert-icon': { color: sneatTokens.success.main },
            }}
          >
            <Typography variant="body2" sx={{ fontSize: '0.82rem', fontWeight: 700, display: 'inline' }}>
              Kuota Moomoo OpenAPI Sebenar:&nbsp;
            </Typography>
            Gateway OpenD Aktif. Terpakai: <strong>{moomooQuota.used_quota ?? 0}</strong> / {moomooQuota.total_quota ?? 100} | Baki Sebenar: <strong>{moomooQuota.remain_quota ?? 100}</strong> / {moomooQuota.total_quota ?? 100} simbol.
          </Alert>
        ) : (
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
              Kuota Moomoo OpenAPI Sebenar:&nbsp;
            </Typography>
            <Chip
              size="small"
              label="TIDAK TERSEDIA"
              sx={{
                fontWeight: 700,
                fontSize: '0.68rem',
                mr: 1,
                backgroundColor: sneatTokens.error.soft,
                color: sneatTokens.error.main,
              }}
            />
            Baki Sebenar: <strong>-</strong> ({moomooQuota?.error || 'OpenD gateway belum disambungkan atau menunggu log masuk broker'}). Mengikut peraturan fail-closed, baki 100 palsu tidak dipaparkan.
          </Alert>
        )
      ) : null}

      {/* Info Disclaimer Banner */}
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
          Nota Peringatan Rekod Kuota:&nbsp;
        </Typography>
        Angka kuota ini adalah rekod dalaman screener (anggaran simbol dikhaskan). Ia mungkin berbeza daripada penggunaan atau baki kuota sebenar dalam akaun Moomoo OpenAPI.
      </Alert>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3, borderRadius: 2 }}
          action={
            <Button color="inherit" size="small" onClick={fetchQuotaData}>
              Cuba Lagi
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* 4 Sneat KPI Summary Cards */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {/* Card 1: Baki Kuota */}
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
                      backgroundColor: sneatTokens.info.soft,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: sneatTokens.info.main,
                    }}
                  >
                    <InventoryIcon sx={{ fontSize: 22 }} />
                  </Box>
                  <Chip
                    size="small"
                    label={isDbMissing ? 'Belum Ada Data' : `${remainingQuota} Baki (Rekod)`}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      borderRadius: 1.5,
                      backgroundColor: sneatTokens.info.soft,
                      color: sneatTokens.info.main,
                    }}
                  />
                </Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.85rem' }}>
                  Baki Kuota Simbol (Anggaran)
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                  {isDbMissing ? '-' : `${remainingQuota} / ${totalQuota}`}
                </Typography>
              </Box>

              <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                    {isDbMissing ? 'Status Rekod' : 'Kapasiti Tersedia (Anggaran)'}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.72rem' }}>
                    {isDbMissing ? 'Tiada data' : `${100 - Math.round(percentUsed)}%`}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={isDbMissing ? 0 : Math.max(0, 100 - percentUsed)}
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

        {/* Card 2: Simbol Aktif Digunakan / Dikhaskan */}
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
                      backgroundColor: sneatTokens.primary.soft,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: sneatTokens.primary.main,
                    }}
                  >
                    <PieChartIcon sx={{ fontSize: 22 }} />
                  </Box>
                  <Chip
                    size="small"
                    label={isDbMissing ? 'Tiada Rekod' : `${usedQuota} / ${totalQuota} Direkod`}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      borderRadius: 1.5,
                      backgroundColor: sneatTokens.primary.soft,
                      color: sneatTokens.primary.main,
                    }}
                  />
                </Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.85rem' }}>
                  Simbol Dikhaskan / Direkod
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                  {isDbMissing ? '-' : `${usedQuota} Simbol`}
                </Typography>
              </Box>

              <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                    Tetingkap Bergolek 30-Hari
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.72rem' }}>
                    Maks 100
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={isDbMissing ? 0 : percentUsed}
                  sx={{
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: (theme) => theme.palette.divider,
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: percentUsed > 80 ? sneatTokens.error.main : sneatTokens.primary.main,
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
                      backgroundColor: percentUsed > 80 ? sneatTokens.error.soft : sneatTokens.warning.soft,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: percentUsed > 80 ? sneatTokens.error.main : sneatTokens.warning.main,
                    }}
                  >
                    <ShowChartIcon sx={{ fontSize: 22 }} />
                  </Box>
                  <Chip
                    size="small"
                    label={isDbMissing ? '-' : `${percentUsed}%`}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      borderRadius: 1.5,
                      backgroundColor: percentUsed > 80 ? sneatTokens.error.soft : sneatTokens.warning.soft,
                      color: percentUsed > 80 ? sneatTokens.error.main : sneatTokens.warning.main,
                    }}
                  />
                </Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.85rem' }}>
                  Kadar Penggunaan (Anggaran)
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                  {isDbMissing ? '-' : `${percentUsed}%`}
                </Typography>
              </Box>

              <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                    Had Amaran (75% / 90%)
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.72rem' }}>
                    {isDbMissing ? 'Tiada data' : (percentUsed >= 90 ? 'Tinggi' : (percentUsed >= 75 ? 'Sederhana' : 'Rendah'))}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={isDbMissing ? 0 : percentUsed}
                  sx={{
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: (theme) => theme.palette.divider,
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: percentUsed > 80 ? sneatTokens.error.main : (percentUsed > 70 ? sneatTokens.warning.main : sneatTokens.success.main),
                      borderRadius: 3,
                    },
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 4: Status Kesihatan Kuota */}
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
                      backgroundColor: isDbMissing ? sneatTokens.secondary.soft : statusBadge.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isDbMissing ? 'text.secondary' : statusBadge.text,
                    }}
                  >
                    {isDbMissing ? (
                      <InventoryIcon sx={{ fontSize: 22 }} />
                    ) : percentUsed >= 90 ? (
                      <ErrorOutlineIcon sx={{ fontSize: 22 }} />
                    ) : percentUsed >= 75 ? (
                      <WarningAmberIcon sx={{ fontSize: 22 }} />
                    ) : (
                      <CheckCircleOutlineIcon sx={{ fontSize: 22 }} />
                    )}
                  </Box>
                  <Chip
                    size="small"
                    label={isDbMissing ? 'TIADA DATA' : statusBadge.label}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      borderRadius: 1.5,
                      backgroundColor: isDbMissing ? sneatTokens.secondary.soft : statusBadge.bg,
                      color: isDbMissing ? 'text.secondary' : statusBadge.text,
                    }}
                  />
                </Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.85rem' }}>
                  Status Rekod Kuota
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: isDbMissing ? 'text.secondary' : statusBadge.text }}>
                  {isDbMissing ? 'TIADA REKOD' : statusBadge.label}
                </Typography>
              </Box>

              <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Dikemas kini: {isDbMissing ? 'Belum dijana' : formatDate(quotaData?.as_of)} (Rekod Dalaman)
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
                Senarai Simbol Kuota K-Line (Rekod Dalaman)
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Rekod simbol yang dikhaskan dalam tetingkap 30-hari (anggaran dalaman, mungkin berbeza daripada baki sebenar Moomoo)
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <TextField
                id="input-search-quota-symbol"
                size="small"
                placeholder="Cari simbol (cth: MGCLY)..."
                value={searchQuery}
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
                size="small"
                label={`${filteredSymbols.length} / ${rawSymbols.length} Simbol`}
                sx={{ fontWeight: 600, fontSize: '0.75rem', borderRadius: 1.5 }}
              />
            </Box>
          </Box>

          {loading && !quotaData ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8 }}>
              <CircularProgress size={36} color="primary" />
              <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
                Memuatkan rekod kuota K-line...
              </Typography>
            </Box>
          ) : isDbMissing ? (
            <Box sx={{ p: 4, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
              <InventoryIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1, opacity: 0.6 }} />
              <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                Belum Ada Data Rekod Kuota
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, maxWidth: 500, mx: 'auto' }}>
                Pangkalan data kuota K-line belum diwujudkan atau enjin screener belum memulakan rekod aktiviti simbol. Keadaan ini berbeza daripada situasi kapasiti penuh (100 / 100).
              </Typography>
            </Box>
          ) : rawSymbols.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
              <InventoryIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1, opacity: 0.6 }} />
              <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.primary' }}>
                Kapasiti Kuota Penuh (100 / 100 Baki)
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, maxWidth: 500, mx: 'auto' }}>
                Pangkalan data wujud tetapi tiada simbol aktif direkodkan dalam tetingkap 30-hari. Kapasiti kuota dalaman adalah 100% tersedia (0 simbol direkodkan).
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
              <Table id="table-kline-quota" size="small" aria-label="Jadual Kuota K-Line">
                <TableHead sx={{ backgroundColor: (theme) => theme.palette.mode === 'dark' ? '#2b2c40' : '#f5f5f9' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', py: 1.5 }}>SIMBOL</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', py: 1.5 }}>MULA DIKIRA (1ST REQUEST)</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', py: 1.5 }}>TARIKH LUPUT (+30 HARI)</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', py: 1.5 }}>BAKI HARI</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.78rem', py: 1.5 }}>KEKERAPAN PANGGILAN</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.78rem', py: 1.5 }}>STATUS WATCHLIST</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSymbols.map((row) => {
                    const isExpired = row.status === 'EXPIRED' || row.days_remaining <= 0;
                    const isInWatchlist = Boolean(row.in_watchlist);
                    return (
                      <TableRow
                        key={row.symbol}
                        hover
                        sx={{
                          '&:last-child td, &:last-child th': { border: 0 },
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        <TableCell component="th" scope="row" sx={{ py: 1.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              label={row.symbol}
                              size="small"
                              sx={{
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                borderRadius: 1.5,
                                backgroundColor: isExpired ? sneatTokens.secondary.soft : sneatTokens.primary.soft,
                                color: isExpired ? 'text.secondary' : sneatTokens.primary.main,
                              }}
                            />
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary', py: 1.5 }}>
                          <Tooltip title={`UTC: ${row.first_requested_at}`} arrow>
                            <span>{formatDate(row.first_requested_at)}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary', py: 1.5 }}>
                          <Tooltip title={`UTC: ${row.expires_at}`} arrow>
                            <span>{formatDate(row.expires_at)}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ py: 1.5 }}>
                          <Chip
                            icon={<ScheduleIcon sx={{ fontSize: '14px !important' }} />}
                            label={isExpired ? 'Luput' : `${row.days_remaining} Hari Lagi`}
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
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem', py: 1.5 }}>
                          <Chip
                            label={`${row.request_count}x`}
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.72rem', borderRadius: 1, borderColor: 'divider' }}
                          />
                        </TableCell>
                        <TableCell align="center" sx={{ py: 1.5 }}>
                          <Chip
                            label={isInWatchlist ? 'DALAM WATCHLIST' : 'TERKELUAR'}
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
