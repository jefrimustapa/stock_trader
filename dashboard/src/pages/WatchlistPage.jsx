import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Paper,
  Chip,
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

  return (
    <Box id="page-watchlist" sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 2.5, sm: 3 } }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '8px',
              backgroundColor: sneatTokens.primary.soft,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: sneatTokens.primary.main,
              boxShadow: '0 2px 8px 0 rgba(105, 108, 255, 0.35)',
              flexShrink: 0,
            }}
          >
            <ViewListIcon sx={{ fontSize: 24 }} />
          </Box>
          <Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '1.2rem', sm: '1.45rem' },
                lineHeight: 1.25,
              }}
            >
              Watchlist Saham Aktif Dwi-Lorong
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25, fontSize: { xs: '0.78rem', sm: '0.85rem' } }}>
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
              backgroundColor: isMarketOpen ? sneatTokens.success.soft : sneatTokens.secondary.soft,
              color: isMarketOpen ? sneatTokens.success.main : sneatTokens.secondary.main,
              borderRadius: 1.5,
            }}
          />
          <Chip
            size="small"
            label={isLive ? 'Data Langsung' : 'Data Sedia Ada'}
            sx={{
              fontWeight: 600,
              backgroundColor: isLive ? sneatTokens.success.soft : sneatTokens.secondary.soft,
              color: isLive ? sneatTokens.success.main : sneatTokens.secondary.main,
              borderRadius: 1.5,
            }}
          />
          <Chip
            size="small"
            icon={<AccessTimeIcon sx={{ fontSize: '12px !important' }} />}
            label={`As of: ${dataAsOf}`}
            sx={{
              fontWeight: 500,
              backgroundColor: 'action.hover',
              borderRadius: 1.5,
            }}
          />
        </Box>
      </Box>

      {/* Quick Summary Cards */}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={4}>
          <Paper
            elevation={0}
            sx={{
              p: 2.25,
              borderRadius: '10px',
              border: (t) => `1px solid ${t.palette.divider}`,
              backgroundColor: 'background.paper',
              boxShadow: (t) => t.palette.mode === 'dark'
                ? '0 2px 14px 0 rgba(0, 0, 0, 0.28)'
                : '0 2px 10px 0 rgba(67, 89, 113, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              transition: 'transform 0.15s ease-in-out',
              '&:hover': {
                transform: 'translateY(-2px)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
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
                <ViewListIcon sx={{ fontSize: 24 }} />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.04em' }}>
                  JUMLAH KAUNTER AKTIF
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.25, lineHeight: 1.1 }}>
                  {items.length}
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
                borderRadius: 1.5,
              }}
            />
          </Paper>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Paper
            elevation={0}
            sx={{
              p: 2.25,
              borderRadius: '10px',
              border: (t) => `1px solid ${t.palette.divider}`,
              backgroundColor: 'background.paper',
              boxShadow: (t) => t.palette.mode === 'dark'
                ? '0 2px 14px 0 rgba(0, 0, 0, 0.28)'
                : '0 2px 10px 0 rgba(67, 89, 113, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              transition: 'transform 0.15s ease-in-out',
              '&:hover': {
                transform: 'translateY(-2px)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
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
                <TrendingUpIcon sx={{ fontSize: 24 }} />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.04em' }}>
                  LORONG MOMENTUM
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.25, lineHeight: 1.1, color: sneatTokens.primary.main }}>
                  {momentumCount}
                </Typography>
              </Box>
            </Box>
            <Chip
              label="Ungu"
              size="small"
              sx={{
                backgroundColor: sneatTokens.primary.soft,
                color: sneatTokens.primary.main,
                fontWeight: 700,
                borderRadius: 1.5,
              }}
            />
          </Paper>
        </Grid>

        <Grid item xs={12} sm={4}>
          <Paper
            elevation={0}
            sx={{
              p: 2.25,
              borderRadius: '10px',
              border: (t) => `1px solid ${t.palette.divider}`,
              backgroundColor: 'background.paper',
              boxShadow: (t) => t.palette.mode === 'dark'
                ? '0 2px 14px 0 rgba(0, 0, 0, 0.28)'
                : '0 2px 10px 0 rgba(67, 89, 113, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              transition: 'transform 0.15s ease-in-out',
              '&:hover': {
                transform: 'translateY(-2px)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: '8px',
                  backgroundColor: sneatTokens.warning.soft,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: sneatTokens.warning.main,
                }}
              >
                <TuneIcon sx={{ fontSize: 24 }} />
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.04em' }}>
                  LORONG SETUP
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.25, lineHeight: 1.1, color: sneatTokens.warning.main }}>
                  {setupCount}
                </Typography>
              </Box>
            </Box>
            <Chip
              label="Ambar"
              size="small"
              sx={{
                backgroundColor: sneatTokens.warning.soft,
                color: sneatTokens.warning.main,
                fontWeight: 700,
                borderRadius: 1.5,
              }}
            />
          </Paper>
        </Grid>
      </Grid>

      {/* Main Watchlist Table Component */}
      <WatchlistTable dataPayload={dataPayload} />
    </Box>
  );
}
