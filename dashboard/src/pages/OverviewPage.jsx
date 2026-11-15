import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TuneIcon from '@mui/icons-material/Tune';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import ViewListIcon from '@mui/icons-material/ViewList';
import SettingsIcon from '@mui/icons-material/Settings';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import SecurityIcon from '@mui/icons-material/Security';
import StorageIcon from '@mui/icons-material/Storage';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward';
import { sneatTokens } from '../theme';
import { KpiCards } from '../components/KpiCards';

export function OverviewPage({ statusData, dataPayload, onNavigate }) {
  const bridge = statusData?.bridge || {};
  const opendStatus = bridge.opend_status || bridge.status || 'UNKNOWN';
  const watchlist = dataPayload?.watchlist || {};
  const items = watchlist.watchlist || [];
  const marketStatus = watchlist.market_status || 'CLOSED';
  const isMarketOpen = String(marketStatus).toUpperCase() === 'OPEN';
  const quota = watchlist.quota_status;
  const hasKlineData = Boolean(quota && typeof quota.kline_30d_remaining === 'number');
  const klineRemaining = hasKlineData ? quota.kline_30d_remaining : '-';
  const klineUsed = hasKlineData ? quota.kline_30d_used : 0;
  const klinePercent = hasKlineData ? Math.min(100, Math.max(0, ((klineUsed || 0) / 100) * 100)) : 0;

  const momentumCount = items.filter(
    (i) => String(i.lane || '').toUpperCase() === 'MOMENTUM'
  ).length;
  const setupCount = items.filter(
    (i) => String(i.lane || '').toUpperCase() === 'SETUP'
  ).length;

  const previewItems = items.slice(0, 4);

  return (
    <Box id="page-overview" sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 2.5, sm: 3 } }}>
      {/* 1. Welcome & Overview Header */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '8px',
              backgroundColor: sneatTokens.primary.main,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              boxShadow: '0 2px 8px 0 rgba(105, 108, 255, 0.35)',
              flexShrink: 0,
            }}
          >
            <DashboardIcon sx={{ fontSize: 22 }} />
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
              Ringkasan &amp; Prestasi Pasaran
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                mt: 0.25,
                fontSize: { xs: '0.78rem', sm: '0.85rem' },
              }}
            >
              Pemantauan masa nyata gerbang OpenD, akaun Moomoo, enjin Sentinel L4, dan kuota API.
            </Typography>
          </Box>
        </Box>

        {/* Quick Status Pills */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            icon={<FiberManualRecordIcon sx={{ fontSize: '10px !important' }} />}
            label={`Pasaran US: ${marketStatus}`}
            sx={{
              fontWeight: 600,
              borderRadius: 1.5,
              backgroundColor: isMarketOpen ? sneatTokens.success.soft : sneatTokens.secondary.soft,
              color: isMarketOpen ? sneatTokens.success.main : sneatTokens.secondary.main,
            }}
          />
          <Chip
            size="small"
            label={`${items.length} Kaunter Aktif`}
            sx={{
              fontWeight: 600,
              borderRadius: 1.5,
              backgroundColor: sneatTokens.primary.soft,
              color: sneatTokens.primary.main,
            }}
          />
          <Chip
            size="small"
            icon={<ShowChartIcon sx={{ fontSize: '14px !important' }} />}
            label="Sneat MUI v6"
            sx={{
              fontWeight: 600,
              borderRadius: 1.5,
              backgroundColor: sneatTokens.info.soft,
              color: sneatTokens.info.main,
              display: { xs: 'none', sm: 'inline-flex' },
            }}
          />
        </Box>
      </Box>

      {/* 2. Unified KPI Cards Row (4 Cards) */}
      <KpiCards statusData={statusData} dataPayload={dataPayload} />

      {/* 3. Balanced 2-Column Sneat Content Architecture */}
      <Grid container spacing={2.5}>
        {/* ======================================================== */}
        {/* Left Column (7.5 Col): Core Modules & Watchlist Snapshot */}
        {/* ======================================================== */}
        <Grid item xs={12} md={7} lg={7.5}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Modular Card A: 4 Core Navigation Modules */}
            <Card
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2.5,
                backgroundColor: 'background.paper',
              }}
            >
              <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: { xs: '0.95rem', sm: '1.05rem' } }}>
                      Akses Pantas Bahagian Papan Pemuka
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                      Navigasi pantas dan kawalan operasi 4 modul utama sistem perdagangan
                    </Typography>
                  </Box>
                </Box>

                <Grid container spacing={2}>
                  {/* Module 1: OpenD Control */}
                  <Grid item xs={12} sm={6}>
                    <Card
                      variant="outlined"
                      sx={{
                        p: 2,
                        height: '100%',
                        borderRadius: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        transition: 'all 0.2s',
                        '&:hover': {
                          borderColor: sneatTokens.warning.main,
                          boxShadow: '0 4px 14px 0 rgba(255, 171, 0, 0.15)',
                        },
                      }}
                    >
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                          <Box
                            sx={{
                              width: 38,
                              height: 38,
                              borderRadius: '8px',
                              backgroundColor: sneatTokens.warning.soft,
                              color: sneatTokens.warning.main,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <TuneIcon sx={{ fontSize: 20 }} />
                          </Box>
                          <Chip
                            size="small"
                            label={`Status: ${opendStatus}`}
                            sx={{
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              borderRadius: 1,
                              backgroundColor: sneatTokens.secondary.soft,
                              color: 'text.secondary',
                            }}
                          />
                        </Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.92rem' }}>
                          Pengurusan OpenD
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', mt: 0.5, mb: 2, lineHeight: 1.4 }}>
                          Urus akaun SIMULATE / REAL, sign-out sesi broker, borang log masuk, dan relay 2FA OTP.
                        </Typography>
                      </Box>
                      <Button
                        id="btn-nav-opend"
                        variant="outlined"
                        color="warning"
                        size="small"
                        fullWidth
                        endIcon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
                        onClick={() => onNavigate && onNavigate('opend')}
                        sx={{ borderRadius: '8px', fontWeight: 600, textTransform: 'none' }}
                      >
                        Buka Pengurusan OpenD
                      </Button>
                    </Card>
                  </Grid>

                  {/* Module 2: Screening Funnel */}
                  <Grid item xs={12} sm={6}>
                    <Card
                      variant="outlined"
                      sx={{
                        p: 2,
                        height: '100%',
                        borderRadius: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        transition: 'all 0.2s',
                        '&:hover': {
                          borderColor: sneatTokens.info.main,
                          boxShadow: '0 4px 14px 0 rgba(3, 195, 236, 0.15)',
                        },
                      }}
                    >
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                          <Box
                            sx={{
                              width: 38,
                              height: 38,
                              borderRadius: '8px',
                              backgroundColor: sneatTokens.info.soft,
                              color: sneatTokens.info.main,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <FilterAltIcon sx={{ fontSize: 20 }} />
                          </Box>
                          <Chip
                            size="small"
                            label="5-Stage Screener"
                            sx={{
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              borderRadius: 1,
                              backgroundColor: sneatTokens.info.soft,
                              color: sneatTokens.info.main,
                            }}
                          />
                        </Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.92rem' }}>
                          Corong Saringan
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', mt: 0.5, mb: 2, lineHeight: 1.4 }}>
                          Visualisasi penapisan 5 peringkat daripada 8,500+ Universe ke Watchlist Akhir.
                        </Typography>
                      </Box>
                      <Button
                        id="btn-nav-funnel"
                        variant="outlined"
                        color="info"
                        size="small"
                        fullWidth
                        endIcon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
                        onClick={() => onNavigate && onNavigate('funnel')}
                        sx={{ borderRadius: '8px', fontWeight: 600, textTransform: 'none' }}
                      >
                        Lihat Corong Saringan
                      </Button>
                    </Card>
                  </Grid>

                  {/* Module 3: Dual-Lane Watchlist */}
                  <Grid item xs={12} sm={6}>
                    <Card
                      variant="outlined"
                      sx={{
                        p: 2,
                        height: '100%',
                        borderRadius: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        transition: 'all 0.2s',
                        '&:hover': {
                          borderColor: sneatTokens.primary.main,
                          boxShadow: '0 4px 14px 0 rgba(105, 108, 255, 0.15)',
                        },
                      }}
                    >
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                          <Box
                            sx={{
                              width: 38,
                              height: 38,
                              borderRadius: '8px',
                              backgroundColor: sneatTokens.primary.soft,
                              color: sneatTokens.primary.main,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <ViewListIcon sx={{ fontSize: 20 }} />
                          </Box>
                          <Chip
                            size="small"
                            label={`${momentumCount} Mom • ${setupCount} Setup`}
                            sx={{
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              borderRadius: 1,
                              backgroundColor: sneatTokens.primary.soft,
                              color: sneatTokens.primary.main,
                            }}
                          />
                        </Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.92rem' }}>
                          Watchlist Dwi-Lorong
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', mt: 0.5, mb: 2, lineHeight: 1.4 }}>
                          Jadual kaunter terpilih dengan skor lorong, nisbah RS vs SPY, ADV20, dan RVOL 15m.
                        </Typography>
                      </Box>
                      <Button
                        id="btn-nav-watchlist"
                        variant="outlined"
                        color="primary"
                        size="small"
                        fullWidth
                        endIcon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
                        onClick={() => onNavigate && onNavigate('watchlist')}
                        sx={{ borderRadius: '8px', fontWeight: 600, textTransform: 'none' }}
                      >
                        Buka Watchlist Dwi-Lorong
                      </Button>
                    </Card>
                  </Grid>

                  {/* Module 4: Screener Settings */}
                  <Grid item xs={12} sm={6}>
                    <Card
                      variant="outlined"
                      sx={{
                        p: 2,
                        height: '100%',
                        borderRadius: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        transition: 'all 0.2s',
                        '&:hover': {
                          borderColor: sneatTokens.success.main,
                          boxShadow: '0 4px 14px 0 rgba(113, 221, 55, 0.15)',
                        },
                      }}
                    >
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                          <Box
                            sx={{
                              width: 38,
                              height: 38,
                              borderRadius: '8px',
                              backgroundColor: sneatTokens.success.soft,
                              color: sneatTokens.success.main,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <SettingsIcon sx={{ fontSize: 20 }} />
                          </Box>
                          <Chip
                            size="small"
                            label="Parameter L0"
                            sx={{
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              borderRadius: 1,
                              backgroundColor: sneatTokens.success.soft,
                              color: sneatTokens.success.main,
                            }}
                          />
                        </Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.92rem' }}>
                          Tetapan Screener
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', mt: 0.5, mb: 2, lineHeight: 1.4 }}>
                          Konfigurasi had keselamatan saringan: Min Price &gt;= $1.00, Volum ADV20, &amp; RVOL.
                        </Typography>
                      </Box>
                      <Button
                        id="btn-nav-settings"
                        variant="outlined"
                        color="success"
                        size="small"
                        fullWidth
                        endIcon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
                        onClick={() => onNavigate && onNavigate('settings')}
                        sx={{ borderRadius: '8px', fontWeight: 600, textTransform: 'none' }}
                      >
                        Buka Tetapan Screener
                      </Button>
                    </Card>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            {/* Modular Card B: Watchlist Snapshot Preview */}
            <Card
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2.5,
                backgroundColor: 'background.paper',
              }}
            >
              <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TrendingUpIcon sx={{ color: sneatTokens.primary.main, fontSize: 20 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: { xs: '0.92rem', sm: '1rem' } }}>
                      Kaunter Tumpuan Semasa (Watchlist Snapshot)
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    endIcon={<ArrowOutwardIcon sx={{ fontSize: 14 }} />}
                    onClick={() => onNavigate && onNavigate('watchlist')}
                    sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem' }}
                  >
                    Lihat Penuh ({items.length})
                  </Button>
                </Box>

                {previewItems.length === 0 ? (
                  <Box sx={{ py: 3, textAlign: 'center' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      Tiada kaunter aktif pada masa ini. Sila jalankan Corong Saringan untuk memuatkan senarai pantauan.
                    </Typography>
                  </Box>
                ) : (
                  <TableContainer sx={{ borderRadius: 1.5, overflowX: 'auto' }}>
                    <Table size="small" sx={{ minWidth: 420 }}>
                      <TableHead>
                        <TableRow sx={{ '& th': { fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary', py: 1 } }}>
                          <TableCell>Simbol</TableCell>
                          <TableCell>Lorong</TableCell>
                          <TableCell align="right">Harga</TableCell>
                          <TableCell align="right">Perubahan</TableCell>
                          <TableCell align="right">RVOL 15m</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {previewItems.map((c) => {
                          const isPos = Number(c.change_pct) >= 0;
                          return (
                            <TableRow key={c.symbol} hover sx={{ '& td': { py: 1, fontSize: '0.8rem' } }}>
                              <TableCell sx={{ fontWeight: 700, color: 'text.primary' }}>
                                {c.symbol}
                                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontSize: '0.7rem' }}>
                                  {c.name}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  label={c.lane}
                                  sx={{
                                    height: 20,
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    borderRadius: 1,
                                    backgroundColor: String(c.lane).toUpperCase() === 'MOMENTUM' ? sneatTokens.primary.soft : sneatTokens.info.soft,
                                    color: String(c.lane).toUpperCase() === 'MOMENTUM' ? sneatTokens.primary.main : sneatTokens.info.main,
                                  }}
                                />
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>
                                ${Number(c.price || 0).toFixed(2)}
                              </TableCell>
                              <TableCell align="right">
                                <Chip
                                  size="small"
                                  label={`${isPos ? '+' : ''}${Number(c.change_pct || 0).toFixed(2)}%`}
                                  sx={{
                                    height: 20,
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    borderRadius: 1,
                                    backgroundColor: isPos ? sneatTokens.success.soft : sneatTokens.error.soft,
                                    color: isPos ? sneatTokens.success.main : sneatTokens.error.main,
                                  }}
                                />
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                                {Number(c.rvol_15m || 0).toFixed(2)}x
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
        </Grid>

        {/* ======================================================== */}
        {/* Right Column (4.5 Col): Security & Infrastructure Health */}
        {/* ======================================================== */}
        <Grid item xs={12} md={5} lg={4.5}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Modular Card C: Architecture & Security Compliance */}
            <Card
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2.5,
                backgroundColor: 'background.paper',
              }}
            >
              <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SecurityIcon sx={{ color: sneatTokens.success.main, fontSize: 22 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: { xs: '0.92rem', sm: '1rem' } }}>
                      Pematuhan Seni Bina &amp; Keselamatan
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label="Patuh"
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      borderRadius: 1,
                      backgroundColor: sneatTokens.success.soft,
                      color: sneatTokens.success.main,
                    }}
                  />
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
                  {/* Item 1 */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                    <CheckCircleOutlineIcon sx={{ color: sneatTokens.success.main, fontSize: 18, mt: 0.2, flexShrink: 0 }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        Authentik SSO &amp; Forward-Auth
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.73rem' }}>
                        Perlindungan HMAC &amp; RS256 JWKS
                      </Typography>
                    </Box>
                  </Box>
                  <Divider />

                  {/* Item 2 */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                    <CheckCircleOutlineIcon sx={{ color: sneatTokens.success.main, fontSize: 18, mt: 0.2, flexShrink: 0 }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        Keselamatan Kredensial MD5
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.73rem' }}>
                        Kata laluan di-hash sebelum ke OpenD
                      </Typography>
                    </Box>
                  </Box>
                  <Divider />

                  {/* Item 3 */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                    <CheckCircleOutlineIcon sx={{ color: sneatTokens.success.main, fontSize: 18, mt: 0.2, flexShrink: 0 }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        Sentinel L4 Circuit Breaker
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.73rem' }}>
                        Had kerugian &amp; pemantauan automatik
                      </Typography>
                    </Box>
                  </Box>
                  <Divider />

                  {/* Item 4 */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                    <CheckCircleOutlineIcon sx={{ color: sneatTokens.success.main, fontSize: 18, mt: 0.2, flexShrink: 0 }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        Cloudflare Named Tunnel
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.73rem' }}>
                        Sijil TLS sah &amp; protokol HTTP/2
                      </Typography>
                    </Box>
                  </Box>
                  <Divider />

                  {/* Item 5 */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25 }}>
                    <CheckCircleOutlineIcon sx={{ color: sneatTokens.success.main, fontSize: 18, mt: 0.2, flexShrink: 0 }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        Had Sempadan Tegar L0
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.73rem' }}>
                        Min Price &gt;= $1.00 mandatori disahkan
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </CardContent>
            </Card>

            {/* Modular Card D: System Connectivity & Diagnostics */}
            <Card
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2.5,
                backgroundColor: 'background.paper',
              }}
            >
              <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <StorageIcon sx={{ color: sneatTokens.primary.main, fontSize: 20 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: { xs: '0.92rem', sm: '1rem' } }}>
                      Status Sambungan &amp; Diagnostik
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label="Sistem Normal"
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.7rem',
                      borderRadius: 1,
                      backgroundColor: sneatTokens.info.soft,
                      color: sneatTokens.info.main,
                    }}
                  />
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                        Gerbang Moomoo OpenD
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                        127.0.0.1:11111 (API) &bull; 22222 (Telnet)
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={opendStatus}
                      sx={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        borderRadius: 1,
                        backgroundColor: String(opendStatus).toUpperCase().includes('CONNECT') ? sneatTokens.success.soft : sneatTokens.warning.soft,
                        color: String(opendStatus).toUpperCase().includes('CONNECT') ? sneatTokens.success.main : sneatTokens.warning.main,
                      }}
                    />
                  </Box>
                  <Divider />

                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                        MCP FastAPI Python Bridge
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                        Port 8005 (Port Dalaman 8000)
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label="AKTIF"
                      sx={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        borderRadius: 1,
                        backgroundColor: sneatTokens.success.soft,
                        color: sneatTokens.success.main,
                      }}
                    />
                  </Box>
                  <Divider />

                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                        Pangkalan Data Konfigurasi
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                        SQLite equity_baseline.sqlite
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label="SEGERAK"
                      sx={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        borderRadius: 1,
                        backgroundColor: sneatTokens.info.soft,
                        color: sneatTokens.info.main,
                      }}
                    />
                  </Box>
                  <Divider />

                  <Box
                    id="overview-kline-quota-row"
                    onClick={() => { window.location.hash = '#/quota'; }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      p: 0.5,
                      borderRadius: 1,
                      '&:hover': {
                        backgroundColor: 'action.hover',
                      },
                    }}
                    title="Klik untuk lihat perincian rekod kuota K-line (anggaran screener)"
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                        Enjin Kuota K-Line (Rekod Dalaman)
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                        {hasKlineData ? `Baki ${klineRemaining} kuota (anggaran screener)` : 'Tiada data kuota'} (Klik untuk perincian)
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={hasKlineData ? `${Math.round(klinePercent)}% DIREKOD` : 'TIADA DATA'}
                      sx={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        borderRadius: 1,
                        backgroundColor: hasKlineData ? (klinePercent > 80 ? sneatTokens.error.soft : sneatTokens.secondary.soft) : 'action.disabledBackground',
                        color: hasKlineData ? (klinePercent > 80 ? sneatTokens.error.main : 'text.primary') : 'text.disabled',
                      }}
                    />
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
