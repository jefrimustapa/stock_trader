import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Paper,
  Tabs,
  Tab,
  Tooltip,
} from '@mui/material';
import ViewListIcon from '@mui/icons-material/ViewList';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { sneatTokens } from '../theme';

export function WatchlistTable({ dataPayload }) {
  const [laneFilter, setLaneFilter] = useState('ALL');

  const watchlistData = dataPayload?.watchlist || {};
  const rawItems = watchlistData.watchlist || [];

  const marketStatus = watchlistData.market_status || 'CLOSED';
  const isLive = watchlistData.is_live || false;
  const dataAsOf = watchlistData.data_as_of || dataPayload?.timestamp || 'Terkini';

  const isMarketOpen = String(marketStatus).toUpperCase() === 'OPEN';

  const filteredItems = rawItems.filter((item) => {
    if (laneFilter === 'ALL') return true;
    return String(item.lane || '').toUpperCase() === laneFilter;
  });

  return (
    <Box id="watchlist" sx={{ mb: 4 }}>
      {/* Header & Market Status Banner */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 1.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ViewListIcon sx={{ color: sneatTokens.primary.main }} />
          Jadual Watchlist Saham Aktif Dwi-Lorong
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Market Status Pill */}
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

          {/* Live Data Pill */}
          <Chip
            size="small"
            label={isLive ? 'Data Langsung' : 'Data Sesi Lepas'}
            sx={{
              fontWeight: 600,
              backgroundColor: isLive ? sneatTokens.info.soft : sneatTokens.secondary.soft,
              color: isLive ? sneatTokens.info.main : 'text.secondary',
            }}
          />

          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            Kemas kini: {typeof dataAsOf === 'string' && dataAsOf.includes('T') ? new Date(dataAsOf).toLocaleTimeString() : dataAsOf}
          </Typography>
        </Box>
      </Box>

      <Card>
        {/* Tabs Filter */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, pt: 1 }}>
          <Tabs
            value={laneFilter}
            onChange={(e, val) => setLaneFilter(val)}
            textColor="primary"
            indicatorColor="primary"
          >
            <Tab label={`Semua (${rawItems.length})`} value="ALL" sx={{ fontWeight: 600 }} />
            <Tab
              label={`Momentum (${rawItems.filter(i => (i.lane || '').toUpperCase() === 'MOMENTUM').length})`}
              value="MOMENTUM"
              sx={{ fontWeight: 600 }}
            />
            <Tab
              label={`Setup (${rawItems.filter(i => (i.lane || '').toUpperCase() === 'SETUP').length})`}
              value="SETUP"
              sx={{ fontWeight: 600 }}
            />
          </Tabs>
        </Box>

        <CardContent sx={{ p: 0 }}>
          <TableContainer component={Paper} elevation={0} sx={{ backgroundColor: 'transparent' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Simbol</TableCell>
                  <TableCell>Nama Syarikat</TableCell>
                  <TableCell align="center">Lorong</TableCell>
                  <TableCell align="right">Skor</TableCell>
                  <TableCell align="right">Harga Semasa</TableCell>
                  <TableCell align="right">Perubahan %</TableCell>
                  <TableCell align="right">ADV 20 (M)</TableCell>
                  <TableCell align="right">RS vs SPY</TableCell>
                  <TableCell align="right">RVOL 15m</TableCell>
                  <TableCell align="right">Jarak 52W High</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems.length > 0 ? (
                  filteredItems.map((row, idx) => {
                    const isMomentum = String(row.lane || '').toUpperCase() === 'MOMENTUM';
                    const changeVal = Number(row.change_pct || row.change || 0);
                    const isPositive = changeVal >= 0;

                    return (
                      <TableRow key={row.symbol || idx} hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                        <TableCell component="th" scope="row">
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: sneatTokens.primary.main }}>
                            {row.symbol}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {row.name || row.company || row.symbol}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            size="small"
                            label={isMomentum ? 'MOMENTUM' : 'SETUP'}
                            sx={{
                              fontWeight: 700,
                              fontSize: '0.68rem',
                              backgroundColor: isMomentum ? sneatTokens.primary.soft : sneatTokens.warning.soft,
                              color: isMomentum ? sneatTokens.primary.main : sneatTokens.warning.main,
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {row.lane_score !== undefined ? Number(row.lane_score).toFixed(1) : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            ${Number(row.price || row.last_price || 0).toFixed(2)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: isPositive ? sneatTokens.success.main : sneatTokens.error.main, fontWeight: 700 }}>
                            {isPositive ? <TrendingUpIcon sx={{ fontSize: 16 }} /> : <TrendingDownIcon sx={{ fontSize: 16 }} />}
                            {isPositive ? '+' : ''}{changeVal.toFixed(2)}%
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {row.adv20 ? `${(row.adv20 / 1000000).toFixed(1)}M` : (row.adv20_m ? `${row.adv20_m}M` : '-')}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 600, color: row.rs_spy > 1 ? sneatTokens.success.main : 'inherit' }}>
                            {row.rs_spy !== undefined ? Number(row.rs_spy).toFixed(2) : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {row.rvol_15m !== undefined ? `${Number(row.rvol_15m).toFixed(1)}x` : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            {row.dist_to_52w_high_pct !== undefined ? `${Number(row.dist_to_52w_high_pct).toFixed(1)}%` : '-'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      <Typography variant="body2">
                        Tiada kaunter dalam senarai watchlist pada masa ini.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
}
