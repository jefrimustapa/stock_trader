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
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InsightsIcon from '@mui/icons-material/Insights';
import SpeedIcon from '@mui/icons-material/Speed';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import { sneatTokens } from '../theme';
import { FunnelStepper } from '../components/FunnelStepper';

export function FunnelPage({ dataPayload }) {
  const watchlist = dataPayload?.watchlist || {};
  const funnel = watchlist.funnel || {};

  const rawWatchlist = Array.isArray(watchlist)
    ? watchlist
    : (Array.isArray(watchlist.watchlist) ? watchlist.watchlist : (watchlist.items || []));

  const finalCount = funnel.final_watchlist_count ?? rawWatchlist.length;
  const universeCount = funnel.cloud_raw_returned ?? funnel.stage1_universe ?? (watchlist.total_screened_cloud || 0);
  const conversionPct = universeCount > 0 ? ((finalCount / universeCount) * 100).toFixed(2) : '0.00';

  return (
    <Box id="page-funnel" sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 2, sm: 3 } }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
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
            <FilterAltIcon sx={{ color: sneatTokens.info.main }} />
            Corong Saringan Saham 5-Peringkat
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
            Seni bina saringan hybrid (HOM-178 Approach C): penapisan progresif daripada ribuan saham US sehingga senarai calon berkualiti tinggi.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            label={`Kadar Pilihan: ${conversionPct}%`}
            sx={{
              fontWeight: 700,
              backgroundColor: sneatTokens.primary.soft,
              color: sneatTokens.primary.main,
            }}
          />
          <Chip
            size="small"
            label={`${finalCount} Calon Akhir`}
            sx={{
              fontWeight: 600,
              backgroundColor: sneatTokens.success.soft,
              color: sneatTokens.success.main,
            }}
          />
        </Box>
      </Box>

      {/* Funnel Stepper Component */}
      <FunnelStepper dataPayload={dataPayload} />

      {/* Funnel Stage Criteria Details */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: '8px',
          border: (t) => `1px solid ${t.palette.divider}`,
          backgroundColor: 'background.paper',
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <InsightsIcon sx={{ color: sneatTokens.primary.main, fontSize: 20 }} />
          Penerangan Kriteria Mengikut Peringkat
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={2.4}>
            <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: (t) => t.palette.mode === 'dark' ? '#2f3045' : '#f8f9fa', height: '100%' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.secondary.main, display: 'block' }}>
                STAGE 1
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 0.5 }}>
                Cloud Universe
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                Saringan peringkat awan mentah Moomoo mengambil beribu-ribu simbol aktif untuk penapisan permulaan.
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={6} md={2.4}>
            <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: (t) => t.palette.mode === 'dark' ? '#2f3045' : '#f8f9fa', height: '100%' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.info.main, display: 'block' }}>
                STAGE 2
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 0.5 }}>
                Kualiti Stage 0
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                Penyingkiran saham sen, modal terhad, dan volum nipis (Harga &gt;= $10, Nilai Pasaran &gt;= $1B, ADV &gt;= 1M).
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={6} md={2.4}>
            <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: (t) => t.palette.mode === 'dark' ? '#2f3045' : '#f8f9fa', height: '100%' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.warning.main, display: 'block' }}>
                STAGE 3
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 0.5 }}>
                Dwi-Lorong
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                Pengasingan berasaskan logik kuantitatif: Momentum (trend agresif &amp; RVOL tinggi) atau Setup (konsolidasi rapi &amp; hampiran 52W).
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={6} md={2.4}>
            <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: (t) => t.palette.mode === 'dark' ? '#2f3045' : '#f8f9fa', height: '100%' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.primary.main, display: 'block' }}>
                STAGE 4
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 0.5 }}>
                Enriched K-Line
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                Pengambilan data lilin K-line berketepatan tinggi bagi 3-5 calon teratas setiap lorong bagi mengoptimumkan kuota API.
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={6} md={2.4}>
            <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: (t) => t.palette.mode === 'dark' ? '#2f3045' : '#f8f9fa', height: '100%' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.success.main, display: 'block' }}>
                STAGE 5
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 0.5 }}>
                Watchlist Akhir
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                Senarai kaunter bersedia untuk diproses oleh agen Tariq (analisis teknikal) dan Nawwar (analisis asas).
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
