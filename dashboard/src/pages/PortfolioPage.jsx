import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Button,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  Tooltip,
  TableSortLabel,
  ButtonGroup,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  TablePagination,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import HistoryIcon from '@mui/icons-material/History';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { sneatTokens } from '../theme';

const formatCurrency = (val, showSign = false) => {
  const num = Number(val) || 0;
  const absFormatted = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (num < 0) {
    return `-$${absFormatted}`;
  }
  if (showSign && num > 0) {
    return `+$${absFormatted}`;
  }
  return `$${absFormatted}`;
};

export function PortfolioPage({ onNavigate, screenerConfig }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL'); // ALL, GAINERS, LOSERS
  const [orderBy, setOrderBy] = useState('market_value');
  const [orderDir, setOrderDir] = useState('desc');
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // Closed Trades History state (HOM-417/418 Option D)
  const [closedTrades, setClosedTrades] = useState([]);
  const [closedTradesTotal, setClosedTradesTotal] = useState(0);
  const [closedTradesPage, setClosedTradesPage] = useState(0);
  const [closedTradesRowsPerPage, setClosedTradesRowsPerPage] = useState(() => Number(screenerConfig?.agent_orders_per_page || 10));
  const [closedTradesSearch, setClosedTradesSearch] = useState('');
  const [closedTradesResult, setClosedTradesResult] = useState('all');
  const [closedTradesLoading, setClosedTradesLoading] = useState(false);
  const [thesisModalTrade, setThesisModalTrade] = useState(null);

  useEffect(() => {
    if (screenerConfig?.agent_orders_per_page) {
      setClosedTradesRowsPerPage(Number(screenerConfig.agent_orders_per_page));
    }
  }, [screenerConfig?.agent_orders_per_page]);

  const fetchClosedTrades = useCallback(async (p = closedTradesPage, limit = closedTradesRowsPerPage, search = closedTradesSearch, resFilter = closedTradesResult) => {
    try {
      setClosedTradesLoading(true);
      let url = `/api/agents/closed-trades?page=${p + 1}&limit=${limit}`;
      if (search && search.trim()) url += `&symbol=${encodeURIComponent(search.trim())}`;
      if (resFilter && resFilter !== 'all') url += `&result=${encodeURIComponent(resFilter)}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setClosedTrades(json.trades || []);
        setClosedTradesTotal(json.total !== undefined ? json.total : (json.trades?.length || 0));
      }
    } catch (err) {
      console.warn('[PortfolioPage] Fetch closed trades error:', err);
    } finally {
      setClosedTradesLoading(false);
    }
  }, [closedTradesPage, closedTradesRowsPerPage, closedTradesSearch, closedTradesResult]);

  useEffect(() => {
    fetchClosedTrades(closedTradesPage, closedTradesRowsPerPage, closedTradesSearch, closedTradesResult);
  }, [fetchClosedTrades, closedTradesPage, closedTradesRowsPerPage, closedTradesSearch, closedTradesResult]);

  // Drill-down dialog state (HOM-396)
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [drillDownOrders, setDrillDownOrders] = useState([]);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [drillDownError, setDrillDownError] = useState(null);

  const handleOpenDrillDown = useCallback(async (position) => {
    setSelectedPosition(position);
    setDrillDownLoading(true);
    setDrillDownError(null);
    setDrillDownOrders([]);
    try {
      const sym = position.symbol || '';
      const res = await fetch(`/api/agents/orders?symbol=${encodeURIComponent(sym)}&limit=100`);
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const json = await res.json();
      setDrillDownOrders(json.orders || []);
    } catch (err) {
      console.error('[Portfolio] Error fetching orders drilldown:', err);
      setDrillDownError(err.message || 'Failed to load agent orders for this symbol.');
    } finally {
      setDrillDownLoading(false);
    }
  }, []);

  const handleCloseDrillDown = useCallback(() => {
    setSelectedPosition(null);
    setDrillDownOrders([]);
    setDrillDownError(null);
  }, []);

  const fetchPortfolio = useCallback(async (isManual = false) => {
    setData((prev) => {
      if (!prev) setLoading(true);
      return prev;
    });
    setIsFetching(true);
    try {
      const res = await fetch('/api/portfolio');
      if (!res.ok) {
        throw new Error(`Server error: HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('[Portfolio] Failed to load portfolio:', err);
      setError(err.message || 'Failed to load portfolio data.');
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
    const timer = setInterval(() => {
      fetchPortfolio(false);
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchPortfolio]);

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && orderDir === 'asc';
    setOrderDir(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const filteredPositions = useMemo(() => {
    const list = data?.positions || [];
    return list.filter((p) => {
      // Exclude closed positions (qty === 0)
      if (p.qty === 0) return false;

      // Search filter
      const matchesSearch =
        (p.symbol || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.stock_name || '').toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      // Side / PnL filter
      if (filterType === 'LONG') return p.side === 'LONG' || p.qty > 0;
      if (filterType === 'SHORT') return p.side === 'SHORT' || p.qty < 0;
      if (filterType === 'GAINERS') return (p.unrealized_pl || 0) > 0;
      if (filterType === 'LOSERS') return (p.unrealized_pl || 0) < 0;
      return true;
    }).sort((a, b) => {
      let valA = a[orderBy];
      let valB = b[orderBy];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
      } else {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      }

      if (valA < valB) return orderDir === 'asc' ? -1 : 1;
      if (valA > valB) return orderDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, searchTerm, filterType, orderBy, orderDir]);

  const summary = data?.summary || {
    total_cost_basis: 0,
    total_market_value: 0,
    total_unrealized_pl: 0,
    total_gross_pl: 0,
    total_estimated_fees: 0,
    total_net_pl: 0,
    total_pl_pct: 0,
    total_net_pl_pct: 0,
    position_count: 0,
  };

  const totalGrossPl = summary.total_gross_pl !== undefined ? summary.total_gross_pl : summary.total_unrealized_pl;
  const totalFees = summary.total_estimated_fees || 0;
  const totalNetPl = summary.total_net_pl !== undefined ? summary.total_net_pl : (totalGrossPl - totalFees);
  const totalNetPlPct = summary.total_net_pl_pct !== undefined ? summary.total_net_pl_pct : summary.total_pl_pct;
  const isPositiveNet = totalNetPl >= 0;
  const isPositiveTotal = summary.total_unrealized_pl >= 0;

  return (
    <Box sx={{ pb: 6 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, mb: 3, gap: 2 }}>
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
              <AccountBalanceWalletIcon sx={{ fontSize: 22 }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Portfolio Holdings
            </Typography>
            <Chip
              size="small"
              label={data?.env ? `Account ${data.env}` : 'SIMULATE'}
              sx={{
                fontWeight: 700,
                fontSize: '0.72rem',
                backgroundColor: data?.env === 'REAL' ? sneatTokens.error.soft : sneatTokens.info.soft,
                color: data?.env === 'REAL' ? sneatTokens.error.main : sneatTokens.info.main,
              }}
            />
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Active holdings, average cost basis, current market price, and unrealized profit/loss.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, alignSelf: { xs: 'flex-end', md: 'center' } }}>
          {lastRefreshed && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'inline-block' } }}>
              Updated: {lastRefreshed.toLocaleTimeString()}
            </Typography>
          )}
          <Button
            variant="outlined"
            size="small"
            startIcon={
              <RefreshIcon
                sx={{
                  animation: isFetching ? 'spin 1s linear infinite' : 'none',
                  '@keyframes spin': {
                    '0%': { transform: 'rotate(0deg)' },
                    '100%': { transform: 'rotate(360deg)' },
                  },
                }}
              />
            }
            onClick={() => fetchPortfolio(true)}
            disabled={isFetching && !data}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </Button>
        </Box>
      </Box>

      {data?.is_stale && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Warning: OpenD/Bridge connection temporarily lost. Showing last known portfolio data ({data.stale_reason || 'OpenD disconnected'}).
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* 4 Summary KPI Cards */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {/* Card 1: Total Market Value */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, backgroundColor: 'background.paper', height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                  Portfolio Market Value
                </Typography>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    backgroundColor: sneatTokens.primary.soft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: sneatTokens.primary.main,
                  }}
                >
                  <AttachMoneyIcon sx={{ fontSize: 20 }} />
                </Box>
              </Box>
              {loading && !data ? (
                <Skeleton variant="rounded" width={140} height={32} sx={{ my: 0.5 }} />
              ) : (
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  ${(summary.total_market_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Typography>
              )}
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                {summary.short_liability > 0
                  ? `Long: $${(summary.long_market_value || summary.total_market_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Short Liability: $${summary.short_liability.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : 'Total current value of all holdings'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 2: Total Cost Basis */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, backgroundColor: 'background.paper', height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                  Total Cost Basis
                </Typography>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    backgroundColor: sneatTokens.secondary.soft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'text.primary',
                  }}
                >
                  <Inventory2Icon sx={{ fontSize: 20 }} />
                </Box>
              </Box>
              {loading && !data ? (
                <Skeleton variant="rounded" width={140} height={32} sx={{ my: 0.5 }} />
              ) : (
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  ${summary.total_cost_basis.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Typography>
              )}
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                Total capital expended (purchase price x units)
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 3: Net Unrealized P&L */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, backgroundColor: 'background.paper', height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                  Net Unrealized P&amp;L
                </Typography>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    backgroundColor: isPositiveNet ? sneatTokens.success.soft : sneatTokens.error.soft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isPositiveNet ? sneatTokens.success.main : sneatTokens.error.main,
                  }}
                >
                  {isPositiveNet ? <TrendingUpIcon sx={{ fontSize: 20 }} /> : <TrendingDownIcon sx={{ fontSize: 20 }} />}
                </Box>
              </Box>
              {loading && !data ? (
                <Skeleton variant="rounded" width={150} height={32} sx={{ my: 0.5 }} />
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 700,
                      color: isPositiveNet ? sneatTokens.success.main : sneatTokens.error.main,
                    }}
                  >
                    {formatCurrency(totalNetPl, true)}
                  </Typography>
                  <Chip
                    size="small"
                    label={`${isPositiveNet ? '+' : ''}${totalNetPlPct.toFixed(2)}%`}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      backgroundColor: isPositiveNet ? sneatTokens.success.soft : sneatTokens.error.soft,
                      color: isPositiveNet ? sneatTokens.success.main : sneatTokens.error.main,
                    }}
                  />
                </Box>
              )}
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                Gross: {formatCurrency(totalGrossPl, true)} | Est. Fees: -${totalFees.toFixed(2)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 4: Active Positions Count */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, backgroundColor: 'background.paper', height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                  Active Positions Count
                </Typography>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    backgroundColor: sneatTokens.info.soft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: sneatTokens.info.main,
                  }}
                >
                  <AccountBalanceWalletIcon sx={{ fontSize: 20 }} />
                </Box>
              </Box>
              {loading && !data ? (
                <Skeleton variant="rounded" width={110} height={32} sx={{ my: 0.5 }} />
              ) : (
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {summary.position_count} Positions
                </Typography>
              )}
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                Account ID: {data?.account_id || '3123530'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filter and Search Bar */}
      <Paper
        sx={{
          p: 2,
          mb: 2.5,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2.5,
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <TextField
          size="small"
          placeholder="Search symbol or company (e.g. TXNM)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ minWidth: { xs: '100%', sm: 320 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
              </InputAdornment>
            ),
          }}
        />

        <ButtonGroup size="small" variant="outlined" sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}>
          <Button
            variant={filterType === 'ALL' ? 'contained' : 'outlined'}
            onClick={() => setFilterType('ALL')}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            All ({loading && !data ? '...' : (data?.positions?.filter(p => p.qty !== 0).length || 0)})
          </Button>
          <Button
            variant={filterType === 'LONG' ? 'contained' : 'outlined'}
            color="primary"
            onClick={() => setFilterType('LONG')}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Long ({data?.positions?.filter(p => (p.side === 'LONG' || p.qty > 0) && p.qty !== 0).length || 0})
          </Button>
          <Button
            variant={filterType === 'SHORT' ? 'contained' : 'outlined'}
            color="warning"
            onClick={() => setFilterType('SHORT')}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Short ({data?.positions?.filter(p => (p.side === 'SHORT' || p.qty < 0) && p.qty !== 0).length || 0})
          </Button>
          <Button
            variant={filterType === 'GAINERS' ? 'contained' : 'outlined'}
            color="success"
            onClick={() => setFilterType('GAINERS')}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Gainers
          </Button>
          <Button
            variant={filterType === 'LOSERS' ? 'contained' : 'outlined'}
            color="error"
            onClick={() => setFilterType('LOSERS')}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Losers
          </Button>
        </ButtonGroup>
      </Paper>

      {/* Main Positions Table */}
      <Paper sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, overflow: 'hidden' }}>
        <TableContainer>
          <Table sx={{ minWidth: 800 }}>
            <TableHead sx={{ backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'symbol'}
                    direction={orderBy === 'symbol' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('symbol')}
                  >
                    Symbol &amp; Company
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'source'}
                    direction={orderBy === 'source' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('source')}
                  >
                    Attribution
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'qty'}
                    direction={orderBy === 'qty' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('qty')}
                  >
                    Units (Qty)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'bought_price'}
                    direction={orderBy === 'bought_price' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('bought_price')}
                  >
                    Buy Price ($)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'current_price'}
                    direction={orderBy === 'current_price' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('current_price')}
                  >
                    Current Price ($)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'total_cost'}
                    direction={orderBy === 'total_cost' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('total_cost')}
                  >
                    Total Cost ($)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'market_value'}
                    direction={orderBy === 'market_value' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('market_value')}
                  >
                    Market Value ($)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'unrealized_pl'}
                    direction={orderBy === 'unrealized_pl' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('unrealized_pl')}
                  >
                    Gross P&amp;L ($)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'estimated_fees'}
                    direction={orderBy === 'estimated_fees' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('estimated_fees')}
                  >
                    Est. Fees ($)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'net_unrealized_pl'}
                    direction={orderBy === 'net_unrealized_pl' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('net_unrealized_pl')}
                  >
                    Net P&amp;L ($ / %)
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && !data ? (
                [1, 2, 3, 4].map((idx) => (
                  <TableRow key={`skeleton-row-${idx}`}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Skeleton variant="rounded" width={65} height={24} sx={{ borderRadius: 1.5 }} />
                        <Skeleton variant="text" width={110} height={20} />
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Skeleton variant="rounded" width={80} height={24} sx={{ mx: 'auto', borderRadius: 1.5 }} />
                    </TableCell>
                    <TableCell align="right"><Skeleton variant="text" width={50} sx={{ ml: 'auto' }} /></TableCell>
                    <TableCell align="right"><Skeleton variant="text" width={60} sx={{ ml: 'auto' }} /></TableCell>
                    <TableCell align="right"><Skeleton variant="text" width={60} sx={{ ml: 'auto' }} /></TableCell>
                    <TableCell align="right"><Skeleton variant="text" width={70} sx={{ ml: 'auto' }} /></TableCell>
                    <TableCell align="right"><Skeleton variant="text" width={70} sx={{ ml: 'auto' }} /></TableCell>
                    <TableCell align="right"><Skeleton variant="text" width={60} sx={{ ml: 'auto' }} /></TableCell>
                    <TableCell align="right"><Skeleton variant="text" width={50} sx={{ ml: 'auto' }} /></TableCell>
                    <TableCell align="right">
                      <Skeleton variant="rounded" width={60} height={24} sx={{ ml: 'auto', borderRadius: 1.5 }} />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredPositions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                    <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      No active positions found
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                      {searchTerm ? 'No symbols match search.' : 'Paper Trading account currently has no holdings.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredPositions.map((pos) => {
                  const isPos = pos.unrealized_pl >= 0;
                  const netPl = pos.net_unrealized_pl !== undefined ? pos.net_unrealized_pl : Number((pos.unrealized_pl - (pos.estimated_fees || 0)).toFixed(2));
                  const netPlPct = pos.net_pl_pct !== undefined ? pos.net_pl_pct : (pos.total_cost > 0 ? Number(((netPl / pos.total_cost) * 100).toFixed(2)) : 0);
                  const isNetPos = netPl >= 0;
                  return (
                    <TableRow
                      key={pos.position_id || pos.symbol}
                      hover
                      onClick={() => handleOpenDrillDown(pos)}
                      data-testid={`portfolio-row-${pos.symbol}`}
                      sx={{
                        '&:last-child td, &:last-child th': { border: 0 },
                        transition: 'background-color 0.15s',
                        cursor: 'pointer',
                      }}
                    >
                      <TableCell component="th" scope="row">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Tooltip title="Klik untuk lihat pesanan ejen (Drill-down)" arrow>
                            <Chip
                              size="small"
                              label={pos.symbol}
                              sx={{
                                fontWeight: 700,
                                fontFamily: 'monospace',
                                fontSize: '0.75rem',
                                borderRadius: 1.5,
                                backgroundColor: sneatTokens.secondary.soft,
                                cursor: 'pointer',
                              }}
                            />
                          </Tooltip>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {pos.stock_name}
                          </Typography>
                          <Tooltip title="Drill-down pesanan ejen">
                            <OpenInNewIcon sx={{ fontSize: 15, color: 'text.secondary', opacity: 0.7 }} />
                          </Tooltip>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip
                          title={
                            pos.source === 'AGENT_PIPELINE'
                              ? `Source: Agent Pipeline | Cycle: ${pos.cycle_id || '-'} | Order: ${pos.order_id || '-'}`
                              : pos.source === 'BROKER_IMPORT'
                              ? `Source: OpenD Broker Order Import | Order: ${pos.order_id || '-'}`
                              : pos.source === 'POSITION_RECONCILED'
                              ? `Source: Automatic OpenD Position Reconciliation | Audit ID: ${pos.order_id || '-'}`
                              : `Source: OpenD Position Reconciliation | Audit ID: ${pos.order_id || '-'}`
                          }
                          arrow
                        >
                          <Chip
                            size="small"
                            label={
                              pos.source === 'AGENT_PIPELINE'
                                ? 'Agent'
                                : pos.source === 'BROKER_IMPORT'
                                ? 'Broker / Manual'
                                : 'Reconciliation'
                            }
                            sx={{
                              fontWeight: 700,
                              fontSize: '0.72rem',
                              borderRadius: 1.5,
                              backgroundColor:
                                pos.source === 'AGENT_PIPELINE'
                                    ? sneatTokens.primary.soft
                                  : pos.source === 'BROKER_IMPORT'
                                  ? sneatTokens.warning.soft
                                  : sneatTokens.secondary.soft,
                              color:
                                pos.source === 'AGENT_PIPELINE'
                                  ? sneatTokens.primary.main
                                  : pos.source === 'BROKER_IMPORT'
                                  ? sneatTokens.warning.main
                                  : sneatTokens.secondary.main,
                            }}
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {(pos.abs_qty !== undefined ? pos.abs_qty : Math.abs(pos.qty)).toLocaleString()}
                            </Typography>
                            {pos.qty < 0 || pos.side === 'SHORT' ? (
                              <Tooltip
                                title="Negative units indicate an active short position, not a closed sold trade."
                                arrow
                              >
                                <Chip
                                  size="small"
                                  label="SHORT"
                                  sx={{
                                    fontWeight: 700,
                                    fontSize: '0.68rem',
                                    height: 19,
                                    backgroundColor: sneatTokens.warning.soft,
                                    color: sneatTokens.warning.main,
                                    cursor: 'help',
                                  }}
                                />
                              </Tooltip>
                            ) : (
                              <Chip
                                size="small"
                                label="LONG"
                                sx={{
                                  fontWeight: 700,
                                  fontSize: '0.68rem',
                                  height: 19,
                                  backgroundColor: sneatTokens.primary.soft,
                                  color: sneatTokens.primary.main,
                                }}
                              />
                            )}
                          </Box>
                          {pos.can_sell_qty !== pos.qty && (
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                              Available to sell: {Math.abs(pos.can_sell_qty)}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          ${pos.bought_price.toFixed(3)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          ${pos.current_price.toFixed(3)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          ${Math.abs(pos.total_cost).toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip
                          title={pos.side === 'SHORT' || pos.qty < 0 ? 'Short Position Liability (obligation to repurchase)' : 'Long Market Value'}
                          arrow
                        >
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            ${Math.abs(pos.market_value).toFixed(2)}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            color: isPos ? sneatTokens.success.main : sneatTokens.error.main,
                          }}
                        >
                          {formatCurrency(pos.unrealized_pl, true)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip
                          title={`Buy: $${(pos.buy_fee !== undefined ? pos.buy_fee : 0).toFixed(2)} | Est. Sell: $${(pos.sell_fee !== undefined ? pos.sell_fee : 0).toFixed(2)}`}
                          arrow
                        >
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                            ${(pos.estimated_fees !== undefined ? pos.estimated_fees : 0).toFixed(2)}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              color: isNetPos ? sneatTokens.success.main : sneatTokens.error.main,
                            }}
                          >
                            {formatCurrency(netPl, true)}
                          </Typography>
                          <Chip
                            size="small"
                            label={`${isNetPos ? '+' : ''}${netPlPct.toFixed(2)}%`}
                            sx={{
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              fontSize: '0.70rem',
                              height: 20,
                              backgroundColor: isNetPos ? sneatTokens.success.soft : sneatTokens.error.soft,
                              color: isNetPos ? sneatTokens.success.main : sneatTokens.error.main,
                            }}
                          />
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Closed Trades History Section (Option D) */}
      <Paper
        elevation={0}
        sx={{
          mt: 4,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ p: 2.5, pb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                bgcolor: sneatTokens.primary.soft,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: sneatTokens.primary.main,
              }}
            >
              <HistoryIcon />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.2 }}>
                Closed Trades History (Round-Trip Completed)
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Historical audit log of completed round-trip trades with FIFO realized P&L
              </Typography>
            </Box>
            <Chip
              label={`${closedTradesTotal} Trades`}
              size="small"
              sx={{ fontWeight: 700, bgcolor: sneatTokens.primary.soft, color: sneatTokens.primary.main }}
            />
          </Box>

          {/* Filter and Search Controls */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Filter by Symbol..."
              value={closedTradesSearch}
              onChange={(e) => {
                setClosedTradesSearch(e.target.value);
                setClosedTradesPage(0);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
              sx={{ width: 180, '& .MuiOutlinedInput-root': { borderRadius: 2, height: 38 } }}
            />
            <ButtonGroup size="small" variant="outlined" sx={{ borderRadius: 2 }}>
              <Button
                variant={closedTradesResult === 'all' ? 'contained' : 'outlined'}
                onClick={() => {
                  setClosedTradesResult('all');
                  setClosedTradesPage(0);
                }}
                sx={{ textTransform: 'none', fontWeight: 600, height: 38 }}
              >
                All
              </Button>
              <Button
                variant={closedTradesResult === 'win' ? 'contained' : 'outlined'}
                color="success"
                onClick={() => {
                  setClosedTradesResult('win');
                  setClosedTradesPage(0);
                }}
                sx={{ textTransform: 'none', fontWeight: 600, height: 38 }}
              >
                Wins
              </Button>
              <Button
                variant={closedTradesResult === 'loss' ? 'contained' : 'outlined'}
                color="error"
                onClick={() => {
                  setClosedTradesResult('loss');
                  setClosedTradesPage(0);
                }}
                sx={{ textTransform: 'none', fontWeight: 600, height: 38 }}
              >
                Losses
              </Button>
            </ButtonGroup>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => fetchClosedTrades(closedTradesPage, closedTradesRowsPerPage, closedTradesSearch, closedTradesResult)}
              sx={{ borderRadius: 2, textTransform: 'none', height: 38 }}
            >
              Refresh
            </Button>
          </Box>
        </Box>

        {closedTradesLoading && closedTrades.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : closedTrades.length > 0 ? (
          <>
            <TableContainer sx={{ maxHeight: 440 }}>
              <Table size="small" stickyHeader>
                <TableHead sx={{ bgcolor: 'action.hover' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>SYMBOL</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>QTY</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>BUY PRICE</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>SELL PRICE</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>REALIZED P&L ($)</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>RETURN (%)</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>HOLD DURATION</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>EXIT DATE</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>ACTION THESIS</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {closedTrades.map((trade, tIdx) => {
                    const isGain = trade.realized_pnl_usd >= 0;
                    return (
                      <TableRow key={trade.id || tIdx} hover>
                        <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                          {trade.symbol}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {trade.quantity}
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                          ${trade.buy_price ? Number(trade.buy_price).toFixed(2) : '-'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          ${Number(trade.sell_price || 0).toFixed(2)}
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={`${isGain ? '+' : ''}$${Number(trade.realized_pnl_usd || 0).toFixed(2)}`}
                            size="small"
                            sx={{
                              fontWeight: 700,
                              fontSize: '0.72rem',
                              bgcolor: isGain ? sneatTokens.success.soft : sneatTokens.error.soft,
                              color: isGain ? sneatTokens.success.main : sneatTokens.error.main,
                            }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              color: isGain ? sneatTokens.success.main : sneatTokens.error.main,
                            }}
                          >
                            {isGain ? '+' : ''}{Number(trade.realized_pnl_pct || 0).toFixed(2)}%
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                          {trade.hold_duration || '-'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                          {trade.exit_date ? new Date(trade.exit_date).toLocaleString() : '-'}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 220 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Tooltip title={trade.thesis || 'Closed Trade'}>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontSize: '0.75rem',
                                  fontWeight: 500,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  maxWidth: 180,
                                  color: 'text.primary',
                                }}
                              >
                                {trade.thesis || 'Closed Trade'}
                              </Typography>
                            </Tooltip>
                            <Tooltip title="View full deliberation details">
                              <IconButton
                                size="small"
                                onClick={() => setThesisModalTrade(trade)}
                                sx={{ p: 0.25, color: sneatTokens.primary.main }}
                              >
                                <InfoOutlinedIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[5, 10, 25, 50]}
              component="div"
              count={closedTradesTotal}
              rowsPerPage={closedTradesRowsPerPage}
              page={closedTradesPage}
              onPageChange={(event, newPage) => {
                setClosedTradesPage(newPage);
                fetchClosedTrades(newPage, closedTradesRowsPerPage, closedTradesSearch, closedTradesResult);
              }}
              onRowsPerPageChange={(event) => {
                const newLimit = parseInt(event.target.value, 10);
                setClosedTradesRowsPerPage(newLimit);
                setClosedTradesPage(0);
                fetchClosedTrades(0, newLimit, closedTradesSearch, closedTradesResult);
              }}
              labelRowsPerPage="Rows per page:"
              labelDisplayedRows={({ from, to, count }) => `${from}–${to} of ${count !== -1 ? count : `more than ${to}`}`}
              sx={{ borderTop: '1px solid', borderColor: 'divider' }}
            />
          </>
        ) : (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No closed round-trip trades found matching current criteria.
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Closed Trade Thesis Modal Dialog */}
      <Dialog
        open={Boolean(thesisModalTrade)}
        onClose={() => setThesisModalTrade(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon sx={{ color: sneatTokens.primary.main }} />
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
              Trade Audit & Rationale: {thesisModalTrade?.symbol}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setThesisModalTrade(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ py: 2 }}>
          {thesisModalTrade && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block' }}>
                  EXIT RATIONALE / THESIS
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, color: 'text.primary', mt: 0.25 }}>
                  {thesisModalTrade.thesis || 'Position Closed'}
                </Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5, bgcolor: 'action.hover', p: 1.5, borderRadius: 2 }}>
                <div>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>Buy Price</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {thesisModalTrade.buy_price ? `$${Number(thesisModalTrade.buy_price).toFixed(2)}` : 'N/A'}
                  </Typography>
                </div>
                <div>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>Sell Price</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    ${Number(thesisModalTrade.sell_price || 0).toFixed(2)}
                  </Typography>
                </div>
                <div>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>Quantity</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {thesisModalTrade.quantity} shares
                  </Typography>
                </div>
                <div>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>Realized P&L</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: thesisModalTrade.realized_pnl_usd >= 0 ? sneatTokens.success.main : sneatTokens.error.main }}>
                    {thesisModalTrade.realized_pnl_usd >= 0 ? '+' : ''}${Number(thesisModalTrade.realized_pnl_usd || 0).toFixed(2)} ({thesisModalTrade.realized_pnl_pct >= 0 ? '+' : ''}${Number(thesisModalTrade.realized_pnl_pct || 0).toFixed(2)}%)
                  </Typography>
                </div>
              </Box>

              {thesisModalTrade.thesis_detail?.haziq && Object.keys(thesisModalTrade.thesis_detail.haziq).length > 0 && (
                <Box sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: sneatTokens.primary.main, mb: 0.5 }}>
                    L2 Haziq Strategy Synthesis
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.82rem', mb: 0.5 }}>
                    Composite Score: <strong>{thesisModalTrade.thesis_detail.haziq.composite_score?.toFixed(1) || 'N/A'}</strong> | Mode: <strong>{thesisModalTrade.thesis_detail.haziq.trading_mode || 'DAY'}</strong>
                  </Typography>
                  {thesisModalTrade.thesis_detail.haziq.rationale && (
                    <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                      "{thesisModalTrade.thesis_detail.haziq.rationale}"
                    </Typography>
                  )}
                </Box>
              )}

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
                <div>Entry Order: <code style={{ fontFamily: 'monospace' }}>{thesisModalTrade.entry_order_id}</code></div>
                <div>Exit Order: <code style={{ fontFamily: 'monospace' }}>{thesisModalTrade.exit_order_id}</code></div>
                <div>Holding Duration: <strong>{thesisModalTrade.hold_duration || '-'}</strong></div>
                <div>Entry Date: {thesisModalTrade.entry_date ? new Date(thesisModalTrade.entry_date).toLocaleString() : '-'}</div>
                <div>Exit Date: {thesisModalTrade.exit_date ? new Date(thesisModalTrade.exit_date).toLocaleString() : '-'}</div>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5 }}>
          <Button onClick={() => setThesisModalTrade(null)} variant="contained" size="small" sx={{ textTransform: 'none', fontWeight: 600 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Drill-down Dialog for Linked Agent Orders (HOM-396) */}
      <Dialog
        open={Boolean(selectedPosition)}
        onClose={handleCloseDrillDown}
        maxWidth="md"
        fullWidth
        data-testid="drilldown-dialog"
        PaperProps={{
          sx: {
            borderRadius: 3,
            p: 1,
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
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
              <ReceiptLongIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                Agent Orders Breakdown: {selectedPosition?.symbol}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {selectedPosition?.stock_name} • Current Units: {selectedPosition?.qty}
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={handleCloseDrillDown} size="small" data-testid="drilldown-close-btn">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ pt: 2 }}>
          {/* Summary KPIs */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2.5, flexWrap: 'wrap' }}>
            <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 140, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">Total Linked Orders</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }} data-testid="drilldown-order-count">
                {drillDownOrders ? drillDownOrders.length : 0}
              </Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 140, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">Holding Units</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {selectedPosition?.qty || 0}
              </Typography>
            </Paper>
            <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 140, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">Avg Buy Price</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                ${(selectedPosition?.bought_price || 0).toFixed(3)}
              </Typography>
            </Paper>
          </Box>

          {drillDownLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6, gap: 1.5 }}>
              <CircularProgress size={36} />
              <Typography variant="body2" color="text.secondary">Loading linked agent orders...</Typography>
            </Box>
          ) : drillDownError ? (
            <Alert severity="error" sx={{ my: 2 }}>{drillDownError}</Alert>
          ) : drillDownOrders.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 5 }}>
              <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                No agent orders recorded for {selectedPosition?.symbol}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Position may have originated from direct broker imports or manual reconciliation.
              </Typography>
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, maxHeight: 380 }}>
              <Table size="small" stickyHeader data-testid="drilldown-orders-table">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Timestamp</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Side</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Status</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Qty</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Price ($)</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Exec Price ($)</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Cycle ID</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Client Order ID</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {drillDownOrders.map((ord) => {
                    const side = (ord.side || ord.order_side || '').toUpperCase();
                    const isBuy = side === 'BUY';
                    const statusStr = (ord.status || '').toUpperCase();
                    const isFilled = statusStr === 'FILLED';
                    return (
                      <TableRow key={ord.id || ord.client_order_id || ord.order_id} hover>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                          {ord.timestamp || ord.created_at || '-'}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={side || 'N/A'}
                            color={isBuy ? 'success' : 'error'}
                            sx={{ fontWeight: 700, fontSize: '0.7rem', height: 20 }}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={statusStr || 'UNKNOWN'}
                            variant={isFilled ? 'filled' : 'outlined'}
                            color={isFilled ? 'primary' : 'default'}
                            sx={{ fontWeight: 600, fontSize: '0.7rem', height: 20 }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          {ord.quantity}
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                          ${Number(ord.price !== undefined ? ord.price : ord.entry_price).toFixed(2)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          ${Number(ord.executed_price !== undefined ? ord.executed_price : ord.entry_price).toFixed(2)}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'text.secondary' }}>
                          {ord.cycle_id || '-'}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'text.secondary' }}>
                          {ord.client_order_id || ord.order_id || '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={handleCloseDrillDown} variant="contained" size="small" sx={{ textTransform: 'none', fontWeight: 600 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
