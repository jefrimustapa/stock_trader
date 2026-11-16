import React from 'react';
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
import ViewListIcon from '@mui/icons-material/ViewList';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TuneIcon from '@mui/icons-material/Tune';
import { sneatTokens } from '../theme';
import { WatchlistTable } from '../components/WatchlistTable';

export function WatchlistPage({ dataPayload }) {
  const watchlist = dataPayload?.watchlist || {};
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

  const momentumCount = items.filter(
    (i) => String(i.lane || '').toUpperCase() === 'MOMENTUM'
  ).length;
  const setupCount = items.filter(
    (i) => String(i.lane || '').toUpperCase() === 'SETUP'
  ).length;

  const totalCount = items.length;
  const momentumPercent = totalCount > 0 ? Math.round((momentumCount / totalCount) * 100) : 0;
  const setupPercent = totalCount > 0 ? Math.round((setupCount / totalCount) * 100) : 0;

  return (
    <Box id="page-watchlist" sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 2.5, sm: 3 } }}>
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
            <ViewListIcon sx={{ fontSize: 26 }} />
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
              Watchlist Saham Aktif Dwi-Lorong
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
              Kaunter saham US melepasi saringan corong 5-peringkat, disusun mengikut lorong MOMENTUM dan SETUP.
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            icon={<FiberManualRecordIcon sx={{ fontSize: '10px !important' }} />}
            label={`Pasaran US: ${marketStatus}`}
            sx={{
              fontWeight: 700,
              fontSize: '0.75rem',
              backgroundColor: isMarketOpen ? sneatTokens.success.soft : sneatTokens.secondary.soft,
              color: isMarketOpen ? sneatTokens.success.main : sneatTokens.secondary.main,
              borderRadius: 1.5,
              height: 28,
            }}
          />
          <Chip
            size="small"
            label={isLive ? 'Data Langsung' : 'Data Sedia Ada'}
            sx={{
              fontWeight: 600,
              fontSize: '0.75rem',
              backgroundColor: isLive ? sneatTokens.info.soft : sneatTokens.secondary.soft,
              color: isLive ? sneatTokens.info.main : sneatTokens.secondary.main,
              borderRadius: 1.5,
              height: 28,
            }}
          />
          <Chip
            size="small"
            icon={<AccessTimeIcon sx={{ fontSize: '12px !important' }} />}
            label={`As of: ${dataAsOf}`}
            sx={{
              fontWeight: 500,
              fontSize: '0.75rem',
              backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(67, 89, 113, 0.06)',
              color: 'text.secondary',
              borderRadius: 1.5,
              height: 28,
            }}
          />
        </Box>
      </Box>

      {/* Quick Summary KPI Cards */}
      <Grid container spacing={2.5}>
        {/* Card 1: Total Active Counters */}
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
                boxShadow: '0 6px 18px rgba(105, 108, 255, 0.16)',
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
                  <ViewListIcon sx={{ fontSize: 22 }} />
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.04em' }}>
                    JUMLAH KAUNTER AKTIF
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem', mt: 0.2 }}>
                    Calon melepasi corong
                  </Typography>
                </Box>
              </Box>
              <Chip
                label="Watchlist"
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
                <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1, letterSpacing: -1 }}>
                  {totalCount}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  100% daripada senarai
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={100}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: sneatTokens.primary.soft,
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: sneatTokens.primary.main,
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
                boxShadow: '0 6px 18px rgba(105, 108, 255, 0.16)',
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
                    Breakout & kesinambungan trend
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
                    Pullback teknikal & asas sokongan
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
