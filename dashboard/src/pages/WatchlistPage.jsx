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
import { sneatTokens } from '../theme';
import { WatchlistTable } from '../components/WatchlistTable';

export function WatchlistPage({ dataPayload }) {
  const watchlist = dataPayload?.watchlist || {};
  const items = watchlist.watchlist || [];
  const marketStatus = watchlist.market_status || 'CLOSED';
  const isMarketOpen = String(marketStatus).toUpperCase() === 'OPEN';
  const isLive = watchlist.is_live || false;
  const dataAsOf = watchlist.data_as_of || dataPayload?.timestamp || 'Terkini';

  const momentumCount = items.filter(
    (i) => String(i.lane || '').toUpperCase() === 'MOMENTUM'
  ).length;
  const setupCount = items.filter(
    (i) => String(i.lane || '').toUpperCase() === 'SETUP'
  ).length;

  return (
    <Box id="page-watchlist" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <ViewListIcon sx={{ color: sneatTokens.primary.main }} />
            Watchlist Saham Aktif Dwi-Lorong
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Kaunter saham US melepasi saringan corong 5-peringkat, disusun mengikut lorong MOMENTUM dan SETUP.
          </Typography>
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
            }}
          />
          <Chip
            size="small"
            label={isLive ? 'Data Langsung' : 'Data Sedia Ada'}
            sx={{
              fontWeight: 600,
              backgroundColor: isLive ? sneatTokens.success.soft : sneatTokens.secondary.soft,
              color: isLive ? sneatTokens.success.main : sneatTokens.secondary.main,
            }}
          />
          <Chip
            size="small"
            icon={<AccessTimeIcon sx={{ fontSize: '12px !important' }} />}
            label={`As of: ${dataAsOf}`}
            sx={{
              fontWeight: 500,
              backgroundColor: 'action.hover',
            }}
          />
        </Box>
      </Box>

      {/* Quick Summary Cards */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: '8px',
              border: (t) => `1px solid ${t.palette.divider}`,
              backgroundColor: 'background.paper',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                JUMLAH KAUNTER AKTIF
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                {items.length}
              </Typography>
            </Box>
            <Chip label="Watchlist" size="small" sx={{ backgroundColor: sneatTokens.primary.soft, color: sneatTokens.primary.main, fontWeight: 700 }} />
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: '8px',
              border: (t) => `1px solid ${t.palette.divider}`,
              backgroundColor: 'background.paper',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                LORONG MOMENTUM
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: sneatTokens.primary.main }}>
                {momentumCount}
              </Typography>
            </Box>
            <Chip label="Ungu" size="small" sx={{ backgroundColor: sneatTokens.primary.soft, color: sneatTokens.primary.main, fontWeight: 700 }} />
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: '8px',
              border: (t) => `1px solid ${t.palette.divider}`,
              backgroundColor: 'background.paper',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                LORONG SETUP
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: sneatTokens.warning.main }}>
                {setupCount}
              </Typography>
            </Box>
            <Chip label="Ambar" size="small" sx={{ backgroundColor: sneatTokens.warning.soft, color: sneatTokens.warning.main, fontWeight: 700 }} />
          </Paper>
        </Grid>
      </Grid>

      {/* Main Watchlist Table Component */}
      <WatchlistTable dataPayload={dataPayload} />
    </Box>
  );
}
