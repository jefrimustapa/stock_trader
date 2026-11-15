import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Paper,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TuneIcon from '@mui/icons-material/Tune';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import ViewListIcon from '@mui/icons-material/ViewList';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import SecurityIcon from '@mui/icons-material/Security';
import { sneatTokens } from '../theme';
import { KpiCards } from '../components/KpiCards';

export function OverviewPage({ statusData, dataPayload, onNavigate }) {
  const bridge = statusData?.bridge || {};
  const opendStatus = bridge.opend_status || bridge.status || 'UNKNOWN';
  const watchlist = dataPayload?.watchlist || {};
  const items = watchlist.watchlist || [];
  const marketStatus = watchlist.market_status || 'CLOSED';
  const isMarketOpen = String(marketStatus).toUpperCase() === 'OPEN';

  const momentumCount = items.filter(
    (i) => String(i.lane || '').toUpperCase() === 'MOMENTUM'
  ).length;
  const setupCount = items.filter(
    (i) => String(i.lane || '').toUpperCase() === 'SETUP'
  ).length;

  return (
    <Box id="page-overview" sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 2, sm: 3 } }}>
      {/* Welcome & Overview Header */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Box>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              fontSize: { xs: '1.2rem', sm: '1.5rem' },
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <DashboardIcon sx={{ color: sneatTokens.primary.main }} />
            Ringkasan &amp; Prestasi Pasaran
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
            Pemantauan masa nyata gerbang OpenD, akaun Moomoo, enjin Sentinel L4, dan kuota API.
          </Typography>
        </Box>

        {/* Quick status pills */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            icon={<FiberManualRecordIcon sx={{ fontSize: '10px !important' }} />}
            label={`Pasaran US: ${marketStatus}`}
            sx={{
              fontWeight: 600,
              backgroundColor: isMarketOpen ? sneatTokens.success.soft : sneatTokens.secondary.soft,
              color: isMarketOpen ? sneatTokens.success.main : sneatTokens.secondary.main,
            }}
          />
          <Chip
            size="small"
            label={`${items.length} Kaunter Aktif`}
            sx={{
              fontWeight: 600,
              backgroundColor: sneatTokens.primary.soft,
              color: sneatTokens.primary.main,
            }}
          />
        </Box>
      </Box>

      {/* KPI Cards Grid */}
      <KpiCards statusData={statusData} dataPayload={dataPayload} />

      {/* Navigation Shortcut Cards (Section Breakdown) */}
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
          Akses Pantas Bahagian Papan Pemuka
        </Typography>
        <Grid container spacing={2.5}>
          {/* Section 1: OpenD Control */}
          <Grid item xs={12} sm={6} md={4}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 18px 0 rgba(0,0,0,0.12)',
                },
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: '8px',
                      backgroundColor: sneatTokens.warning.soft,
                      color: sneatTokens.warning.main,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <TuneIcon />
                  </Box>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
                      Pengurusan OpenD
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Status: {opendStatus}
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                  Urus pertukaran akaun Paper Trading (SIMULATE / REAL), sign-out sesi broker, borang log masuk Moomoo, dan relay 2FA OTP.
                </Typography>
                <Button
                  id="btn-nav-opend"
                  variant="outlined"
                  color="warning"
                  size="small"
                  fullWidth
                  endIcon={<ArrowForwardIcon />}
                  onClick={() => onNavigate && onNavigate('opend')}
                  sx={{ borderRadius: '8px', fontWeight: 600 }}
                >
                  Buka Pengurusan OpenD
                </Button>
              </CardContent>
            </Card>
          </Grid>

          {/* Section 2: Screening Funnel */}
          <Grid item xs={12} sm={6} md={4}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 18px 0 rgba(0,0,0,0.12)',
                },
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: '8px',
                      backgroundColor: sneatTokens.info.soft,
                      color: sneatTokens.info.main,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FilterAltIcon />
                  </Box>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
                      Corong Saringan
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      5-Stage Hybrid Pipeline
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                  Visualisasi penapisan 5 peringkat daripada 8,500+ Universe, saringan Kualiti Stage 0, pemilihan dwi-lorong, hingga Watchlist Akhir.
                </Typography>
                <Button
                  id="btn-nav-funnel"
                  variant="outlined"
                  color="info"
                  size="small"
                  fullWidth
                  endIcon={<ArrowForwardIcon />}
                  onClick={() => onNavigate && onNavigate('funnel')}
                  sx={{ borderRadius: '8px', fontWeight: 600 }}
                >
                  Lihat Corong Saringan
                </Button>
              </CardContent>
            </Card>
          </Grid>

          {/* Section 3: Dual-Lane Watchlist */}
          <Grid item xs={12} sm={6} md={4}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 18px 0 rgba(0,0,0,0.12)',
                },
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: '8px',
                      backgroundColor: sneatTokens.primary.soft,
                      color: sneatTokens.primary.main,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ViewListIcon />
                  </Box>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
                      Watchlist Dwi-Lorong
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {momentumCount} Momentum • {setupCount} Setup
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                  Jadual interaktif kaunter terpilih dengan skor lorong, nisbah RS vs SPY, ADV20, RVOL 15m, dan jarak dari paras tertinggi 52 minggu.
                </Typography>
                <Button
                  id="btn-nav-watchlist"
                  variant="outlined"
                  color="primary"
                  size="small"
                  fullWidth
                  endIcon={<ArrowForwardIcon />}
                  onClick={() => onNavigate && onNavigate('watchlist')}
                  sx={{ borderRadius: '8px', fontWeight: 600 }}
                >
                  Buka Watchlist Dwi-Lorong
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>

      {/* System Health & Architecture Summary */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: '8px',
          border: (t) => `1px solid ${t.palette.divider}`,
          backgroundColor: 'background.paper',
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <SecurityIcon sx={{ color: sneatTokens.success.main, fontSize: 20 }} />
          Pematuhan Seni Bina &amp; Keselamatan
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleOutlineIcon sx={{ color: sneatTokens.success.main, fontSize: 18 }} />
              <Typography variant="body2">Authentik SSO &amp; Forward-Auth</Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', pl: 3.2, display: 'block' }}>
              Perlindungan HMAC &amp; RS256 JWKS
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleOutlineIcon sx={{ color: sneatTokens.success.main, fontSize: 18 }} />
              <Typography variant="body2">Keselamatan Kredensial MD5</Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', pl: 3.2, display: 'block' }}>
              Kata laluan di-hash sebelum ke OpenD
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleOutlineIcon sx={{ color: sneatTokens.success.main, fontSize: 18 }} />
              <Typography variant="body2">Sentinel L4 Circuit Breaker</Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', pl: 3.2, display: 'block' }}>
              Had kerugian &amp; pemantauan automatik
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleOutlineIcon sx={{ color: sneatTokens.success.main, fontSize: 18 }} />
              <Typography variant="body2">Cloudflare Named Tunnel</Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', pl: 3.2, display: 'block' }}>
              Sijil TLS sah &amp; protokol HTTP/2
            </Typography>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
