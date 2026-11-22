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
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import { sneatTokens } from '../theme';

export function PortfolioPage({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL'); // ALL, GAINERS, LOSERS
  const [orderBy, setOrderBy] = useState('market_value');
  const [orderDir, setOrderDir] = useState('desc');
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchPortfolio = useCallback(async (isManual = false) => {
    setData((prev) => {
      if (!prev) setLoading(true);
      return prev;
    });
    setIsFetching(true);
    try {
      const res = await fetch('/api/portfolio');
      if (!res.ok) {
        throw new Error(`Ralat pelayan: HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('[Portfolio] Gagal memuatkan portfolio:', err);
      setError(err.message || 'Gagal memuatkan data portfolio.');
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
      // Search filter
      const matchesSearch =
        (p.symbol || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.stock_name || '').toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      // PnL filter
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
    total_pl_pct: 0,
    position_count: 0,
  };

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
              Portfolio Pegangan
            </Typography>
            <Chip
              size="small"
              label={data?.env ? `Akaun ${data.env}` : 'SIMULATE'}
              sx={{
                fontWeight: 700,
                fontSize: '0.72rem',
                backgroundColor: data?.env === 'REAL' ? sneatTokens.error.soft : sneatTokens.info.soft,
                color: data?.env === 'REAL' ? sneatTokens.error.main : sneatTokens.info.main,
              }}
            />
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Senarai saham aktif dipegang, harga beli (kos purata), harga semasa pasaran dan untung/rugi belum direalisasi.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, alignSelf: { xs: 'flex-end', md: 'center' } }}>
          {lastRefreshed && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: { xs: 'none', sm: 'inline-block' } }}>
              Kemas kini: {lastRefreshed.toLocaleTimeString()}
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
            {isFetching ? 'Mengemas kini...' : 'Segar Semula'}
          </Button>
        </Box>
      </Box>

      {data?.is_stale && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Perhatian: Sambungan ke OpenD/Bridge terputus sementara. Memaparkan data portfolio terakhir yang diketahui ({data.stale_reason || 'OpenD disconnected'}).
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
                  Nilai Pasaran Portfolio
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
                  ${summary.total_market_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Typography>
              )}
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                Jumlah nilai semasa bagi semua unit pegangan
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
                  Jumlah Kos Belian
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
                Modal pokok dibelanjakan (harga beli x unit)
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 3: Unrealized P&L */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, backgroundColor: 'background.paper', height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                  Untung / Rugi Belum Direalisasi
                </Typography>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '8px',
                    backgroundColor: isPositiveTotal ? sneatTokens.success.soft : sneatTokens.error.soft,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isPositiveTotal ? sneatTokens.success.main : sneatTokens.error.main,
                  }}
                >
                  {isPositiveTotal ? <TrendingUpIcon sx={{ fontSize: 20 }} /> : <TrendingDownIcon sx={{ fontSize: 20 }} />}
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
                      color: isPositiveTotal ? sneatTokens.success.main : sneatTokens.error.main,
                    }}
                  >
                    {isPositiveTotal ? '+' : ''}${summary.total_unrealized_pl.toFixed(2)}
                  </Typography>
                  <Chip
                    size="small"
                    label={`${isPositiveTotal ? '+' : ''}${summary.total_pl_pct.toFixed(2)}%`}
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      backgroundColor: isPositiveTotal ? sneatTokens.success.soft : sneatTokens.error.soft,
                      color: isPositiveTotal ? sneatTokens.success.main : sneatTokens.error.main,
                    }}
                  />
                </Box>
              )}
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                Perbezaan nilai pasaran semasa berbanding kos
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
                  Bilangan Kaunter Aktif
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
                  {summary.position_count} Kaunter
                </Typography>
              )}
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                Akaun ID: {data?.account_id || '3123530'}
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
          placeholder="Cari simbol atau syarikat (cth: TXNM)..."
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
            Semua ({loading && !data ? '...' : (data?.positions?.length || 0)})
          </Button>
          <Button
            variant={filterType === 'GAINERS' ? 'contained' : 'outlined'}
            color="success"
            onClick={() => setFilterType('GAINERS')}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Untung
          </Button>
          <Button
            variant={filterType === 'LOSERS' ? 'contained' : 'outlined'}
            color="error"
            onClick={() => setFilterType('LOSERS')}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Rugi
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
                    Simbol &amp; Kaunter
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'source'}
                    direction={orderBy === 'source' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('source')}
                  >
                    Atribusi
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'qty'}
                    direction={orderBy === 'qty' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('qty')}
                  >
                    Unit (Qty)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'bought_price'}
                    direction={orderBy === 'bought_price' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('bought_price')}
                  >
                    Harga Beli ($)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'current_price'}
                    direction={orderBy === 'current_price' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('current_price')}
                  >
                    Harga Semasa ($)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'total_cost'}
                    direction={orderBy === 'total_cost' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('total_cost')}
                  >
                    Jumlah Kos ($)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'market_value'}
                    direction={orderBy === 'market_value' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('market_value')}
                  >
                    Nilai Pasaran ($)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'unrealized_pl'}
                    direction={orderBy === 'unrealized_pl' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('unrealized_pl')}
                  >
                    Untung / Rugi ($)
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                  <TableSortLabel
                    active={orderBy === 'unrealized_pl_pct'}
                    direction={orderBy === 'unrealized_pl_pct' ? orderDir : 'asc'}
                    onClick={() => handleRequestSort('unrealized_pl_pct')}
                  >
                    Untung / Rugi (%)
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
                    <TableCell align="right">
                      <Skeleton variant="rounded" width={60} height={24} sx={{ ml: 'auto', borderRadius: 1.5 }} />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredPositions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    <Typography variant="body1" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      Tiada posisi aktif dijumpai
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                      {searchTerm ? 'Tiada kaunter sepadan dengan carian.' : 'Akaun Paper Trading belum mempunyai sebarang unit pegangan.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredPositions.map((pos) => {
                  const isPos = pos.unrealized_pl >= 0;
                  return (
                    <TableRow
                      key={pos.position_id || pos.symbol}
                      hover
                      sx={{
                        '&:last-child td, &:last-child th': { border: 0 },
                        transition: 'background-color 0.15s',
                      }}
                    >
                      <TableCell component="th" scope="row">
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Chip
                            size="small"
                            label={pos.symbol}
                            sx={{
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              fontSize: '0.75rem',
                              borderRadius: 1.5,
                              backgroundColor: sneatTokens.secondary.soft,
                            }}
                          />
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {pos.stock_name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip
                          title={
                            pos.source === 'AGENT_PIPELINE'
                              ? `Punca: Ejen Pipeline | Kitaran: ${pos.cycle_id || '-'} | Pesanan: ${pos.order_id || '-'}`
                              : pos.source === 'BROKER_IMPORT'
                              ? `Punca: Import Pesanan Broker OpenD | Pesanan: ${pos.order_id || '-'}`
                              : pos.source === 'POSITION_RECONCILED'
                              ? `Punca: Rekonsiliasi Automatik Posisi OpenD | Audit ID: ${pos.order_id || '-'}`
                              : `Punca: Rekonsiliasi Posisi OpenD | Audit ID: ${pos.order_id || '-'}`
                          }
                          arrow
                        >
                          <Chip
                            size="small"
                            label={
                              pos.source === 'AGENT_PIPELINE'
                                ? 'Ejen'
                                : pos.source === 'BROKER_IMPORT'
                                ? 'Broker / Manual'
                                : 'Rekonsiliasi'
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
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {pos.qty.toLocaleString()}
                        </Typography>
                        {pos.can_sell_qty !== pos.qty && (
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Boleh jual: {pos.can_sell_qty}
                          </Typography>
                        )}
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
                          ${pos.total_cost.toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          ${pos.market_value.toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: isPos ? sneatTokens.success.main : sneatTokens.error.main,
                          }}
                        >
                          {isPos ? '+' : ''}${pos.unrealized_pl.toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          size="small"
                          label={`${isPos ? '+' : ''}${pos.unrealized_pl_pct.toFixed(2)}%`}
                          sx={{
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            fontSize: '0.72rem',
                            backgroundColor: isPos ? sneatTokens.success.soft : sneatTokens.error.soft,
                            color: isPos ? sneatTokens.success.main : sneatTokens.error.main,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
