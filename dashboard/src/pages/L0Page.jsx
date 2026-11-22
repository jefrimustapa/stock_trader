import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Paper,
  Chip,
  LinearProgress,
} from '@mui/material';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import ViewListIcon from '@mui/icons-material/ViewList';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TuneIcon from '@mui/icons-material/Tune';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import { sneatTokens } from '../theme';
import { FunnelStepper } from '../components/FunnelStepper';
import { WatchlistTable } from '../components/WatchlistTable';

export function L0Page({ dataPayload, screenerConfig, configLoading, configError, onRefresh }) {
  const [localConfig, setLocalConfig] = useState(
    screenerConfig || dataPayload?.screenerConfig || null
  );
  const [loading, setLoading] = useState(
    screenerConfig !== undefined
      ? Boolean(configLoading)
      : (dataPayload?.screenerConfig ? false : true)
  );
  const [error, setError] = useState(Boolean(configError));

  useEffect(() => {
    if (screenerConfig !== undefined) {
      setLocalConfig(screenerConfig);
      setLoading(Boolean(configLoading));
      setError(Boolean(configError));
      return;
    }
    if (dataPayload?.screenerConfig) {
      setLocalConfig(dataPayload.screenerConfig);
      setLoading(false);
      setError(false);
      return;
    }
    let isMounted = true;
    async function fetchConfig() {
      try {
        setLoading(true);
        const res = await fetch('/api/screener/config');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (isMounted) {
          setLocalConfig(data?.config || null);
          setError(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(true);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    fetchConfig();
    return () => {
      isMounted = false;
    };
  }, [screenerConfig, configLoading, configError, dataPayload?.screenerConfig]);

  const activeConfig = screenerConfig !== undefined ? screenerConfig : (localConfig || dataPayload?.screenerConfig);

  const watchlist = dataPayload?.watchlist || {};
  const funnel = watchlist.funnel || {};
  const items = Array.isArray(watchlist)
    ? watchlist
    : (Array.isArray(watchlist.watchlist) ? watchlist.watchlist : (watchlist.items || []));

  const marketStatus = watchlist.market_status || 'CLOSED';
  const isMarketOpen = String(marketStatus).toUpperCase() === 'OPEN';
  const isLive = watchlist.is_live || false;
  const rawDataAsOf = watchlist.data_as_of || dataPayload?.timestamp || 'Terkini';
  const dataAsOf = typeof rawDataAsOf === 'string' && rawDataAsOf.includes('T')
    ? rawDataAsOf.split('.')[0].replace('T', ' ')
    : rawDataAsOf;

  const finalCount = funnel.final_watchlist_count ?? items.length;
  const universeCount = funnel.cloud_raw_returned ?? funnel.stage1_universe ?? (watchlist.total_screened_cloud || 0);
  const conversionPct = universeCount > 0 ? ((finalCount / universeCount) * 100).toFixed(2) : '0.00';

  const momentumCount = items.filter(
    (i) => String(i.lane || '').toUpperCase() === 'MOMENTUM'
  ).length;
  const setupCount = items.filter(
    (i) => String(i.lane || '').toUpperCase() === 'SETUP'
  ).length;

  const totalCount = items.length;
  const momentumPercent = totalCount > 0 ? Math.round((momentumCount / totalCount) * 100) : 0;
  const setupPercent = totalCount > 0 ? Math.round((setupCount / totalCount) * 100) : 0;

  // Countdown timer calculation (L0 Screener runs every 300 seconds / 5 minutes)
  const scanIntervalSeconds = 300;
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const rawTime = watchlist.generated_at || watchlist.data_as_of || dataPayload?.timestamp;
    if (!rawTime) return 300;
    const genMs = new Date(rawTime).getTime();
    if (isNaN(genMs)) return 300;
    const elapsed = Math.floor((Date.now() - genMs) / 1000);
    if (elapsed < 0) return 300;
    const rem = scanIntervalSeconds - (elapsed % scanIntervalSeconds);
    return rem > 0 ? rem : scanIntervalSeconds;
  });

  useEffect(() => {
    const rawTime = watchlist.generated_at || watchlist.data_as_of || dataPayload?.timestamp;
    const calculateSecondsLeft = () => {
      if (!rawTime) return 300;
      const genMs = new Date(rawTime).getTime();
      if (isNaN(genMs)) return 300;
      const elapsed = Math.floor((Date.now() - genMs) / 1000);
      if (elapsed < 0) return 300;
      const rem = scanIntervalSeconds - (elapsed % scanIntervalSeconds);
      return rem > 0 ? rem : scanIntervalSeconds;
    };

    setSecondsLeft(calculateSecondsLeft());

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (typeof onRefresh === 'function') {
            onRefresh();
          }
          return scanIntervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [watchlist.generated_at, watchlist.data_as_of, dataPayload?.timestamp, onRefresh]);

  const countdownMinutes = Math.floor(secondsLeft / 60);
  const countdownSeconds = secondsLeft % 60;
  const countdownFormatted = `${String(countdownMinutes).padStart(2, '0')}:${String(countdownSeconds).padStart(2, '0')}`;
  const countdownProgressPct = Math.min(100, Math.max(0, Math.round(((scanIntervalSeconds - secondsLeft) / scanIntervalSeconds) * 100)));

  const tradingMode = String(dataPayload?.watchlist?.trading_mode || localConfig?.trading_mode || dataPayload?.trading_mode || 'DAY').toUpperCase();
  const isSwingMode = tradingMode === 'SWING';

  return (
    <Box id="page-l0" sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 2.5, sm: 3 } }}>
      {/* Page Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: '10px',
              backgroundColor: sneatTokens.primary.soft,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: sneatTokens.primary.main,
              boxShadow: '0 4px 12px 0 rgba(105, 108, 255, 0.35)',
              flexShrink: 0,
            }}
          >
            <FilterAltIcon sx={{ fontSize: 26 }} />
          </Box>
          <Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '1.25rem', sm: '1.45rem' },
                lineHeight: 1.25,
                letterSpacing: -0.4,
              }}
            >
              L0: Saringan &amp; Watchlist Dwi-Lorong
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                mt: 0.35,
                fontSize: { xs: '0.8rem', sm: '0.875rem' },
                lineHeight: 1.4,
              }}
            >
              Seni bina saringan hybrid (L0 Screener): penapisan progresif corong 5-peringkat dan pemantauan aktif kaunter MOMENTUM &amp; SETUP.
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Visual Corong Saringan 5-Peringkat (Funnel Stepper) */}
      <FunnelStepper
        dataPayload={dataPayload}
        screenerConfig={activeConfig}
        configLoading={loading}
        configError={error}
      />

      {/* Countdown Card / Bar until Next Watchlist */}
      <Paper
        id="card-watchlist-countdown"
        elevation={0}
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: '10px',
          border: (t) => `1px solid ${t.palette.divider}`,
          backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255, 171, 0, 0.06)' : 'rgba(255, 171, 0, 0.04)',
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '10px',
              backgroundColor: isSwingMode ? 'rgba(105, 108, 255, 0.16)' : sneatTokens.warning.soft,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isSwingMode ? '#696cff' : sneatTokens.warning.main,
              boxShadow: isSwingMode ? '0 4px 12px 0 rgba(105, 108, 255, 0.25)' : '0 4px 12px 0 rgba(255, 171, 0, 0.25)',
              flexShrink: 0,
            }}
          >
            {isSwingMode ? <ShowChartIcon sx={{ fontSize: 26 }} /> : <TimerOutlinedIcon sx={{ fontSize: 26 }} />}
          </Box>
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {isSwingMode
                ? 'Radar Pemantauan Berjadual & Adaptif Top-Down L0 (Swing Trading)'
                : 'Countdown Imbasan L0 Screener (Kitaran 5 Minit / 300s)'}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mt: 0.2 }}>
              <Typography
                id="text-watchlist-countdown"
                variant="h4"
                sx={{
                  fontWeight: 800,
                  color: isSwingMode ? '#696cff' : sneatTokens.warning.main,
                  fontFamily: 'monospace',
                  letterSpacing: 1,
                  lineHeight: 1,
                  fontSize: { xs: '1.45rem', sm: '1.85rem' },
                }}
              >
                {isSwingMode ? '09:00, 13:00, 16:30 NY' : countdownFormatted}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                {isSwingMode ? 'jadual struktur 4H/Daily + pemicu 1H zon minat' : 'sehingga kemas kini senarai pantau seterusnya'}
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.4, display: 'block' }}>
              Cap masa semasa: <strong>{dataAsOf}</strong> • Status pasaran: <strong>{marketStatus}</strong> ({isMarketOpen ? 'Dibuka' : 'Ditutup'}) • Mod: <strong>{tradingMode}</strong>
            </Typography>
          </Box>
        </Box>

        <Box sx={{ width: { xs: '100%', md: 260 }, display: 'flex', flexDirection: 'column', gap: 0.8 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              {isSwingMode ? 'Status Radar Top-Down' : 'Kemajuan kitaran imbasan'}
            </Typography>
            <Typography variant="caption" sx={{ color: isSwingMode ? '#696cff' : sneatTokens.warning.main, fontWeight: 700 }}>
              {isSwingMode ? 'AKTIF (4H / 1H)' : `${countdownProgressPct}%`}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={isSwingMode ? 100 : countdownProgressPct}
            sx={{
              height: 8,
              borderRadius: 4,
              backgroundColor: (t) => t.palette.mode === 'dark'
                ? (isSwingMode ? 'rgba(105, 108, 255, 0.15)' : 'rgba(255, 171, 0, 0.15)')
                : (isSwingMode ? 'rgba(105, 108, 255, 0.12)' : 'rgba(255, 171, 0, 0.12)'),
              '& .MuiLinearProgress-bar': {
                backgroundColor: isSwingMode ? '#696cff' : sneatTokens.warning.main,
                borderRadius: 4,
              },
            }}
          />
        </Box>
      </Paper>

      {/* Watchlist KPI Metric Cards */}
      <Grid container spacing={2}>
        {/* Card 1: Total Watchlist */}
        <Grid item xs={12} sm={4}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: '10px',
              border: (t) => `1px solid ${t.palette.divider}`,
              backgroundColor: 'background.paper',
              boxShadow: (t) => t.palette.mode === 'dark'
                ? '0 2px 14px 0 rgba(0, 0, 0, 0.28)'
                : '0 2px 10px 0 rgba(67, 89, 113, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: (t) => t.palette.mode === 'dark' ? '0 6px 18px rgba(0,0,0,0.4)' : '0 6px 18px rgba(67,89,113,0.14)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
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
                  <ShowChartIcon sx={{ fontSize: 22 }} />
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.04em' }}>
                    JUMLAH KAUNTER
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem', mt: 0.2 }}>
                    Melepasi corong 5-peringkat
                  </Typography>
                </Box>
              </Box>
              <Chip
                label="L0 Watchlist"
                size="small"
                sx={{
                  backgroundColor: sneatTokens.info.soft,
                  color: sneatTokens.info.main,
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  borderRadius: 1.5,
                  height: 24,
                }}
              />
            </Box>

            <Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1, letterSpacing: -1, color: sneatTokens.info.main }}>
                  {totalCount}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  Daripada ribuan saham US
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={100}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(3, 195, 236, 0.15)' : 'rgba(3, 195, 236, 0.1)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: sneatTokens.info.main,
                    borderRadius: 3,
                  },
                }}
              />
            </Box>
          </Paper>
        </Grid>

        {/* Card 2: Momentum Lane */}
        <Grid item xs={12} sm={4}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: '10px',
              border: (t) => `1px solid ${t.palette.divider}`,
              backgroundColor: 'background.paper',
              boxShadow: (t) => t.palette.mode === 'dark'
                ? '0 2px 14px 0 rgba(0, 0, 0, 0.28)'
                : '0 2px 10px 0 rgba(67, 89, 113, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 18px rgba(105, 108, 255, 0.2)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
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
                  <TrendingUpIcon sx={{ fontSize: 22 }} />
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.04em' }}>
                    LORONG MOMENTUM
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem', mt: 0.2 }}>
                    Kekuatan relatif &amp; volum tinggi
                  </Typography>
                </Box>
              </Box>
              <Chip
                label="Momentum"
                size="small"
                sx={{
                  backgroundColor: sneatTokens.primary.soft,
                  color: sneatTokens.primary.main,
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  borderRadius: 1.5,
                  height: 24,
                }}
              />
            </Box>

            <Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1, letterSpacing: -1, color: sneatTokens.primary.main }}>
                  {momentumCount}
                </Typography>
                <Typography variant="caption" sx={{ color: sneatTokens.primary.main, fontWeight: 700 }}>
                  {momentumPercent}% daripada senarai
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={momentumPercent}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(105, 108, 255, 0.15)' : 'rgba(105, 108, 255, 0.1)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: sneatTokens.primary.main,
                    borderRadius: 3,
                  },
                }}
              />
            </Box>
          </Paper>
        </Grid>

        {/* Card 3: Setup Lane */}
        <Grid item xs={12} sm={4}>
          <Paper
            elevation={0}
            sx={{
              p: 2.5,
              borderRadius: '10px',
              border: (t) => `1px solid ${t.palette.divider}`,
              backgroundColor: 'background.paper',
              boxShadow: (t) => t.palette.mode === 'dark'
                ? '0 2px 14px 0 rgba(0, 0, 0, 0.28)'
                : '0 2px 10px 0 rgba(67, 89, 113, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 18px rgba(255, 171, 0, 0.2)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: '8px',
                    backgroundColor: sneatTokens.warning.soft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: sneatTokens.warning.main,
                  }}
                >
                  <TuneIcon sx={{ fontSize: 22 }} />
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.04em' }}>
                    LORONG SETUP
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem', mt: 0.2 }}>
                    Pullback teknikal &amp; asas sokongan
                  </Typography>
                </Box>
              </Box>
              <Chip
                label="Setup"
                size="small"
                sx={{
                  backgroundColor: sneatTokens.warning.soft,
                  color: sneatTokens.warning.main,
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  borderRadius: 1.5,
                  height: 24,
                }}
              />
            </Box>

            <Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1, letterSpacing: -1, color: sneatTokens.warning.main }}>
                  {setupCount}
                </Typography>
                <Typography variant="caption" sx={{ color: sneatTokens.warning.main, fontWeight: 700 }}>
                  {setupPercent}% daripada senarai
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={setupPercent}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255, 171, 0, 0.15)' : 'rgba(255, 171, 0, 0.1)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: sneatTokens.warning.main,
                    borderRadius: 3,
                  },
                }}
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Main Watchlist Table Component */}
      <WatchlistTable dataPayload={dataPayload} />
    </Box>
  );
}
