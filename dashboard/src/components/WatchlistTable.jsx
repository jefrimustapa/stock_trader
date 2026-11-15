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
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import TuneIcon from '@mui/icons-material/Tune';
import { sneatTokens } from '../theme';

export function WatchlistTable({ dataPayload }) {
  const [laneFilter, setLaneFilter] = useState('ALL');

  const watchlistData = dataPayload?.watchlist || {};
  const rawItems = Array.isArray(watchlistData)
    ? watchlistData
    : (Array.isArray(watchlistData.watchlist) ? watchlistData.watchlist : (watchlistData.items || []));

  const marketStatus = watchlistData.market_status || 'CLOSED';
  const isLive = watchlistData.is_live || false;
  const dataAsOf = watchlistData.data_as_of || dataPayload?.timestamp || 'Terkini';

  const isMarketOpen = String(marketStatus).toUpperCase() === 'OPEN';

  const filteredItems = rawItems.filter((item) => {
    if (laneFilter === 'ALL') return true;
    return String(item.lane || '').toUpperCase() === laneFilter;
  });

  const momentumCount = rawItems.filter(i => (i.lane || '').toUpperCase() === 'MOMENTUM').length;
  const setupCount = rawItems.filter(i => (i.lane || '').toUpperCase() === 'SETUP').length;

  return (
    <Box id="watchlist" sx={{ width: '100%', mb: 2 }}>
      <Card
        sx={{
          borderRadius: '10px',
          border: (t) => `1px solid ${t.palette.divider}`,
          boxShadow: (t) => t.palette.mode === 'dark'
            ? '0 2px 14px 0 rgba(0, 0, 0, 0.28)'
            : '0 2px 10px 0 rgba(67, 89, 113, 0.08)',
          overflow: 'hidden',
        }}
      >
        {/* Card Toolbar with Filter Tabs and Status */}
        <Box
          sx={{
            px: { xs: 1.5, sm: 2.5 },
            pt: { xs: 1, sm: 1.5 },
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.01)' : '#FAFAFC',
          }}
        >
          <Tabs
            value={laneFilter}
            onChange={(e, val) => setLaneFilter(val)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            textColor="primary"
            indicatorColor="primary"
            sx={{
              minHeight: 46,
              '& .MuiTab-root': {
                minHeight: 46,
                fontWeight: 600,
                fontSize: { xs: '0.8rem', sm: '0.875rem' },
                textTransform: 'none',
                px: { xs: 1.5, sm: 2 },
              },
            }}
          >
            <Tab label={`Semua (${rawItems.length})`} value="ALL" />
            <Tab label={`Momentum (${momentumCount})`} value="MOMENTUM" />
            <Tab label={`Setup (${setupCount})`} value="SETUP" />
          </Tabs>

          <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1, pb: { xs: 1, md: 0 } }}>
            <Chip
              size="small"
              icon={<FiberManualRecordIcon sx={{ fontSize: '10px !important' }} />}
              label={`Pasaran US: ${marketStatus}`}
              sx={{
                fontWeight: 700,
                fontSize: '0.72rem',
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
                fontSize: '0.72rem',
                backgroundColor: isLive ? sneatTokens.info.soft : sneatTokens.secondary.soft,
                color: isLive ? sneatTokens.info.main : 'text.secondary',
                borderRadius: 1.5,
              }}
            />
          </Box>
        </Box>

        {/* Mobile Horizontal Scroll Hint */}
        <Box
          sx={{
            display: { xs: 'flex', md: 'none' },
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1,
            backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(105, 108, 255, 0.12)' : 'rgba(105, 108, 255, 0.06)',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <SwapHorizIcon sx={{ color: sneatTokens.primary.main, fontSize: 18 }} />
            <Typography variant="caption" sx={{ color: sneatTokens.primary.main, fontWeight: 700, fontSize: '0.75rem' }}>
              Leret mendatar jadual untuk metrik penuh (ADV20, RS, RVOL, 52W)
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
            {filteredItems.length} kaunter
          </Typography>
        </Box>

        <CardContent sx={{ p: 0 }}>
          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              backgroundColor: 'transparent',
              width: '100%',
              maxWidth: '100%',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <Table size="small" sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      whiteSpace: 'nowrap',
                      position: 'sticky',
                      left: 0,
                      zIndex: 3,
                      backgroundColor: (theme) => theme.palette.mode === 'dark' ? '#2B2C40' : '#F5F5F9',
                      boxShadow: (theme) => theme.palette.mode === 'dark'
                        ? '2px 0 5px -2px rgba(0,0,0,0.5)'
                        : '2px 0 5px -2px rgba(67,89,113,0.15)',
                      pl: 2.5,
                      fontWeight: 700,
                    }}
                  >
                    Simbol
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>Nama Syarikat</TableCell>
                  <TableCell align="center" sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>Lorong</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>Skor</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>Harga</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>Perubahan %</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>ADV 20 (M)</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>RS vs SPY</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>RVOL 15m</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 700, pr: 2.5 }}>Jarak 52W High</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems.length > 0 ? (
                  filteredItems.map((row, idx) => {
                    const isMomentum = String(row.lane || '').toUpperCase() === 'MOMENTUM';
                    const changeVal = Number(row.change_pct || row.change || 0);
                    const isPositive = changeVal >= 0;
                    const advVal = row.adv_20 ?? row.adv20 ?? row.adv;
                    const dist52w = row.setup_metrics?.dist_to_52w_high_pct ?? row.dist_to_52w_high_pct;

                    return (
                      <TableRow
                        key={row.symbol || idx}
                        hover
                        sx={{
                          transition: 'background-color 0.15s',
                          '&:hover': {
                            backgroundColor: (theme) => theme.palette.mode === 'dark'
                              ? 'rgba(255, 255, 255, 0.04)'
                              : 'rgba(67, 89, 113, 0.04)',
                          },
                          '&:last-child td, &:last-child th': { border: 0 },
                        }}
                      >
                        {/* Sticky Symbol Cell */}
                        <TableCell
                          component="th"
                          scope="row"
                          sx={{
                            position: 'sticky',
                            left: 0,
                            zIndex: 2,
                            backgroundColor: (theme) => theme.palette.mode === 'dark' ? '#2B2C40' : '#FFFFFF',
                            boxShadow: (theme) => theme.palette.mode === 'dark'
                              ? '2px 0 5px -2px rgba(0,0,0,0.5)'
                              : '2px 0 5px -2px rgba(67,89,113,0.15)',
                            pl: 2.5,
                          }}
                        >
                          <Typography
                            variant="subtitle2"
                            sx={{
                              fontWeight: 700,
                              color: sneatTokens.primary.main,
                              letterSpacing: '0.02em',
                            }}
                          >
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
                              borderRadius: 1.5,
                              px: 0.5,
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
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.5,
                              color: isPositive ? sneatTokens.success.main : sneatTokens.error.main,
                              fontWeight: 700,
                              backgroundColor: isPositive ? sneatTokens.success.soft : sneatTokens.error.soft,
                              px: 1,
                              py: 0.25,
                              borderRadius: 1,
                              fontSize: '0.75rem',
                            }}
                          >
                            {isPositive ? <TrendingUpIcon sx={{ fontSize: 14 }} /> : <TrendingDownIcon sx={{ fontSize: 14 }} />}
                            {isPositive ? '+' : ''}{changeVal.toFixed(2)}%
                          </Box>
                        </TableCell>

                        <TableCell align="right">
                          <Typography variant="body2">
                            {advVal !== undefined && advVal !== null ? `${(Number(advVal) / 1000000).toFixed(1)}M` : '-'}
                          </Typography>
                        </TableCell>

                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 600,
                              color: row.rs_spy > 1 ? sneatTokens.success.main : 'inherit',
                            }}
                          >
                            {row.rs_spy !== undefined && row.rs_spy !== null ? Number(row.rs_spy).toFixed(2) : '-'}
                          </Typography>
                        </TableCell>

                        <TableCell align="right">
                          <Typography variant="body2">
                            {row.rvol_15m !== undefined && row.rvol_15m !== null ? `${Number(row.rvol_15m).toFixed(2)}x` : '-'}
                          </Typography>
                        </TableCell>

                        <TableCell align="right" sx={{ pr: 2.5 }}>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            {dist52w !== undefined && dist52w !== null ? `${Number(dist52w).toFixed(1)}%` : '-'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <TuneIcon sx={{ fontSize: 32, opacity: 0.5 }} />
                        <Typography variant="body2">
                          Tiada kaunter dalam senarai watchlist bagi kategori ini pada masa ini.
                        </Typography>
                      </Box>
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
