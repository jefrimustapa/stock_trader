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
  TextField,
  InputAdornment,
  IconButton,
} from '@mui/material';
import ViewListIcon from '@mui/icons-material/ViewList';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import TuneIcon from '@mui/icons-material/Tune';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import { sneatTokens } from '../theme';
import { KlineDrawer } from './KlineDrawer';

export function WatchlistTable({ dataPayload }) {
  const [laneFilter, setLaneFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStock, setSelectedStock] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleRowClick = (stock) => {
    setSelectedStock(stock);
    setDrawerOpen(true);
  };

  const watchlistData = dataPayload?.watchlist || {};
  const rawItems = Array.isArray(watchlistData)
    ? watchlistData
    : (Array.isArray(watchlistData.watchlist) ? watchlistData.watchlist : (watchlistData.items || []));

  const filteredItems = rawItems.filter((item) => {
    const matchesLane = laneFilter === 'ALL' || String(item.lane || '').toUpperCase() === laneFilter;
    if (!matchesLane) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toUpperCase();
    const sym = (item.symbol || '').toUpperCase();
    const name = (item.name || item.company || '').toUpperCase();
    return sym.includes(q) || name.includes(q);
  });

  const momentumCount = rawItems.filter(i => (i.lane || '').toUpperCase() === 'MOMENTUM').length;
  const setupCount = rawItems.filter(i => (i.lane || '').toUpperCase() === 'SETUP').length;

  const formatAdv = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '-';
    const num = Number(val);
    if (num > 10000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    return `${num.toFixed(1)}M`;
  };

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
          backgroundColor: 'background.paper',
        }}
      >
        {/* Card Toolbar with Filter Tabs, Hint Chip, and Search Bar */}
        <Box
          sx={{
            px: { xs: 1.5, sm: 2.5 },
            py: { xs: 1, sm: 1.25 },
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#FAFAFC',
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
              minHeight: 44,
              '& .MuiTab-root': {
                minHeight: 44,
                fontWeight: 600,
                fontSize: { xs: '0.82rem', sm: '0.875rem' },
                textTransform: 'none',
                px: { xs: 1.5, sm: 2.25 },
                borderRadius: '8px',
                transition: 'all 0.15s ease',
              },
            }}
          >
            <Tab
              label={`All (${rawItems.length})`}
              value="ALL"
              icon={<ViewListIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
            />
            <Tab
              label={`Momentum (${momentumCount})`}
              value="MOMENTUM"
              icon={<TrendingUpIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
            />
            <Tab
              label={`Setup (${setupCount})`}
              value="SETUP"
              icon={<TuneIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
            />
          </Tabs>

          {/* Search Box, Hint Chip & Quick Counter Count */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexGrow: { xs: 1, md: 0 } }}>
            <Chip
              size="small"
              icon={<ShowChartIcon sx={{ fontSize: '13px !important' }} />}
              label="Click row for K-line"
              sx={{
                fontWeight: 600,
                fontSize: '0.72rem',
                backgroundColor: sneatTokens.primary.soft,
                color: sneatTokens.primary.main,
                borderRadius: 1.5,
                height: 28,
                display: { xs: 'none', sm: 'inline-flex' },
              }}
            />

            <TextField
              id="input-search-watchlist"
              size="small"
              placeholder="Search symbol / company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchQuery('')} sx={{ p: 0.5 }}>
                      <ClearIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
              sx={{
                width: { xs: '100%', sm: 220 },
                '& .MuiOutlinedInput-root': {
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  height: 36,
                  backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
                },
              }}
            />

            <Chip
              size="small"
              label={`${filteredItems.length} symbols`}
              sx={{
                fontWeight: 600,
                fontSize: '0.72rem',
                backgroundColor: sneatTokens.primary.soft,
                color: sneatTokens.primary.main,
                borderRadius: 1.5,
                height: 28,
                display: { xs: 'none', sm: 'inline-flex' },
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
              Swipe horizontally for full metrics (ADV20, RS, RVOL, 52W)
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', fontWeight: 600 }}>
            {filteredItems.length} symbols
          </Typography>
        </Box>

        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
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
            <Table size="small" sx={{ minWidth: 840 }}>
              <TableHead>
                <TableRow
                  sx={{
                    backgroundColor: (theme) => theme.palette.mode === 'dark' ? '#2B2C40' : '#F5F5F9',
                  }}
                >
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
                      fontSize: '0.72rem',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                      py: 1.5,
                    }}
                  >
                    Symbol
                  </TableCell>
                  <TableCell
                    sx={{
                      whiteSpace: 'nowrap',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                      py: 1.5,
                    }}
                  >
                    Company Name
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{
                      whiteSpace: 'nowrap',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                      py: 1.5,
                    }}
                  >
                    Lane
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      whiteSpace: 'nowrap',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                      py: 1.5,
                    }}
                  >
                    Score
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      whiteSpace: 'nowrap',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                      py: 1.5,
                    }}
                  >
                    Price
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      whiteSpace: 'nowrap',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                      py: 1.5,
                    }}
                  >
                    Change %
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      whiteSpace: 'nowrap',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                      py: 1.5,
                    }}
                  >
                    <Tooltip title="20-Day Average Daily Volume" arrow placement="top">
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4 }}>
                        ADV 20 (M)
                        <InfoOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      whiteSpace: 'nowrap',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                      py: 1.5,
                    }}
                  >
                    <Tooltip title="Relative Strength vs SPY (> 1.0 = Outperforming Market)" arrow placement="top">
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4 }}>
                        RS vs SPY
                        <InfoOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      whiteSpace: 'nowrap',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                      py: 1.5,
                    }}
                  >
                    <Tooltip title="15-Minute Relative Volume (> 1.0x = Unusual Volume)" arrow placement="top">
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4 }}>
                        RVOL 15m
                        <InfoOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      whiteSpace: 'nowrap',
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                      py: 1.5,
                      pr: 2.5,
                    }}
                  >
                    <Tooltip title="Percentage distance from 52-Week High" arrow placement="top">
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4 }}>
                        52W High Dist
                        <InfoOutlinedIcon sx={{ fontSize: 13, opacity: 0.6 }} />
                      </Box>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems.length > 0 ? (
                  filteredItems.map((row, idx) => {
                    const isMomentum = String(row.lane || '').toUpperCase() === 'MOMENTUM';
                    const changeVal = Number(row.change_pct ?? row.change ?? 0);
                    const isPositive = changeVal > 0;
                    const isZero = changeVal === 0;
                    const advVal = row.adv_20 ?? row.adv20 ?? row.adv;
                    const dist52w = row.setup_metrics?.dist_to_52w_high_pct ?? row.dist_to_52w_high_pct ?? row.dist_52w_high;
                    const rsVal = row.rs_spy ?? row.rs_vs_spy ?? row.rs;
                    const rvolVal = row.rvol_15m ?? row.rvol15m ?? row.rvol;
                    const companyName = row.name || row.company || row.symbol;

                    return (
                      <TableRow
                        key={row.symbol || idx}
                        hover
                        onClick={() => handleRowClick(row)}
                        sx={{
                          cursor: 'pointer',
                          transition: 'background-color 0.15s',
                          '&:hover': {
                            backgroundColor: (theme) => theme.palette.mode === 'dark'
                              ? 'rgba(105, 108, 255, 0.08)'
                              : 'rgba(105, 108, 255, 0.04)',
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
                            py: 1.5,
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography
                              variant="subtitle2"
                              sx={{
                                fontWeight: 700,
                                color: sneatTokens.primary.main,
                                letterSpacing: '0.02em',
                                fontSize: '0.875rem',
                              }}
                            >
                              {row.symbol}
                            </Typography>
                            {Boolean(row.symbol && row.symbol.replace(/^US\./, '').length === 5 && (row.symbol.endsWith('Y') || row.symbol.endsWith('F'))) && (
                              <Tooltip title="US Over-The-Counter (OTC) symbol (No Moomoo K-line feed)">
                                <Chip
                                  size="small"
                                  label="OTC"
                                  sx={{
                                    height: 18,
                                    fontSize: '0.62rem',
                                    fontWeight: 700,
                                    backgroundColor: sneatTokens.info.soft,
                                    color: sneatTokens.info.main,
                                    cursor: 'help',
                                  }}
                                />
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>

                        {/* Company Name with single-line truncation + tooltip */}
                        <TableCell sx={{ py: 1.5 }}>
                          <Tooltip title={companyName} arrow placement="top-start">
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 500,
                                maxWidth: { xs: 180, sm: 260 },
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {companyName}
                            </Typography>
                          </Tooltip>
                        </TableCell>

                        {/* Lane Chip */}
                        <TableCell align="center" sx={{ py: 1.5 }}>
                          <Chip
                            size="small"
                            icon={isMomentum ? <TrendingUpIcon sx={{ fontSize: '13px !important' }} /> : <TuneIcon sx={{ fontSize: '13px !important' }} />}
                            label={isMomentum ? 'MOMENTUM' : 'SETUP'}
                            sx={{
                              fontWeight: 700,
                              fontSize: '0.68rem',
                              backgroundColor: isMomentum ? sneatTokens.primary.soft : sneatTokens.warning.soft,
                              color: isMomentum ? sneatTokens.primary.main : sneatTokens.warning.main,
                              borderRadius: 1.5,
                              px: 0.5,
                              height: 24,
                            }}
                          />
                        </TableCell>

                        {/* Lane Score */}
                        <TableCell align="right" sx={{ py: 1.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {row.lane_score !== undefined && row.lane_score !== null ? Number(row.lane_score).toFixed(1) : '-'}
                          </Typography>
                        </TableCell>

                        {/* Price */}
                        <TableCell align="right" sx={{ py: 1.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace, sans-serif' }}>
                            ${Number(row.price || row.last_price || 0).toFixed(2)}
                          </Typography>
                        </TableCell>

                        {/* Change % */}
                        <TableCell align="right" sx={{ py: 1.5 }}>
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.4,
                              color: isZero
                                ? 'text.secondary'
                                : (isPositive ? sneatTokens.success.main : sneatTokens.error.main),
                              fontWeight: 700,
                              backgroundColor: isZero
                                ? 'action.hover'
                                : (isPositive ? sneatTokens.success.soft : sneatTokens.error.soft),
                              px: 0.9,
                              py: 0.3,
                              borderRadius: 1.25,
                              fontSize: '0.75rem',
                              lineHeight: 1,
                            }}
                          >
                            {!isZero && (
                              isPositive ? <TrendingUpIcon sx={{ fontSize: 13 }} /> : <TrendingDownIcon sx={{ fontSize: 13 }} />
                            )}
                            {isPositive ? '+' : ''}{changeVal.toFixed(2)}%
                          </Box>
                        </TableCell>

                        {/* ADV 20 (M) */}
                        <TableCell align="right" sx={{ py: 1.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, fontFamily: 'monospace, sans-serif' }}>
                            {formatAdv(advVal)}
                          </Typography>
                        </TableCell>

                        {/* RS vs SPY */}
                        <TableCell align="right" sx={{ py: 1.5 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 600,
                              fontFamily: 'monospace, sans-serif',
                              color: (rsVal !== undefined && rsVal !== null && Number(rsVal) > 1.0)
                                ? sneatTokens.success.main
                                : 'text.primary',
                            }}
                          >
                            {rsVal !== undefined && rsVal !== null && !isNaN(rsVal) ? Number(rsVal).toFixed(2) : '-'}
                          </Typography>
                        </TableCell>

                        {/* RVOL 15m */}
                        <TableCell align="right" sx={{ py: 1.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, fontFamily: 'monospace, sans-serif' }}>
                            {rvolVal !== undefined && rvolVal !== null && !isNaN(rvolVal) ? `${Number(rvolVal).toFixed(2)}x` : '-'}
                          </Typography>
                        </TableCell>

                        {/* Dist 52W High */}
                        <TableCell align="right" sx={{ pr: 2.5, py: 1.5 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace, sans-serif',
                              color: (dist52w !== undefined && dist52w !== null && Number(dist52w) >= -5.0)
                                ? sneatTokens.success.main
                                : 'text.secondary',
                              fontWeight: (dist52w !== undefined && dist52w !== null && Number(dist52w) >= -5.0)
                                ? 600
                                : 400,
                            }}
                          >
                            {dist52w !== undefined && dist52w !== null && !isNaN(dist52w) ? `${Number(dist52w).toFixed(1)}%` : '-'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                        <Box
                          sx={{
                            width: 52,
                            height: 52,
                            borderRadius: '12px',
                            backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(67, 89, 113, 0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <TuneIcon sx={{ fontSize: 28, opacity: 0.5 }} />
                        </Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                          No Stocks Found
                        </Typography>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', maxWidth: 400 }}>
                          {searchQuery
                            ? `No symbols match "${searchQuery}". Try another symbol or name.`
                            : 'No symbols in the watchlist for this category currently.'}
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Table Footer Status Info */}
          <Box
            sx={{
              px: { xs: 2, sm: 2.5 },
              py: 1.5,
              borderTop: 1,
              borderColor: 'divider',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.01)' : '#FAFAFC',
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
              Showing {filteredItems.length} of {rawItems.length} active stocks
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
              Funnel ranking prioritizes composite scores of technical momentum &amp; support setups
            </Typography>
          </Box>
        </CardContent>
      </Card>

      <KlineDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        stock={selectedStock}
      />
    </Box>
  );
}

export default WatchlistTable;
