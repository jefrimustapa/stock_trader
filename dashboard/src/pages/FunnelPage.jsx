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
  const funnel = watchlist.funnel || {
    stage1_universe: 8520,
    stage2_quality: 1420,
    stage3_dual_lane: 48,
    stage4_kline: 10,
    stage5_final: (watchlist.watchlist || []).length || 8,
  };

  const finalCount = funnel.stage5_final || (watchlist.watchlist || []).length || 8;
  const conversionPct = ((finalCount / (funnel.stage1_universe || 8500)) * 100).toFixed(2);

  return (
    <Box id="page-funnel" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterAltIcon sx={{ color: sneatTokens.info.main }} />
            Corong Saringan Saham 5-Peringkat
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Seni bina saringan hybrid (HOM-178 Approach C): penapisan progresif daripada ribuan saham US sehingga senarai calon berkualiti tinggi.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
          <Grid size={{ xs: 12, md: 2.4 }}>
            <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: (t) => t.palette.mode === 'dark' ? '#2f3045' : '#f8f9fa', height: '100%' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.secondary.main, display: 'block' }}>
                STAGE 1
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 0.5 }}>
                Cloud Universe
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', mt: 1 }}>
                Semua instrumen ekuiti pasaran US yang aktif dan didagangkan di bursa NYSE &amp; NASDAQ.
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 2.4 }}>
            <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: (t) => t.palette.mode === 'dark' ? '#2f3045' : '#f8f9fa', height: '100%' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.info.main, display: 'block' }}>
                STAGE 2
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 0.5 }}>
                Kualiti Stage 0
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', mt: 1 }}>
                Harga &gt;= $10, Permodalan Pasaran &gt;= $1B, dan ADV20 &gt;= 1J unit saham untuk keselamatan likuiditi.
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 2.4 }}>
            <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: (t) => t.palette.mode === 'dark' ? '#2f3045' : '#f8f9fa', height: '100%' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.warning.main, display: 'block' }}>
                STAGE 3
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 0.5 }}>
                Pengelasan Dwi-Lorong
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', mt: 1 }}>
                Pemisahan calon kepada lorong MOMENTUM (RS vs SPY kuat) dan SETUP (fasa konsolidasi dasar).
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 2.4 }}>
            <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: (t) => t.palette.mode === 'dark' ? '#2f3045' : '#f8f9fa', height: '100%' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.primary.main, display: 'block' }}>
                STAGE 4
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 0.5 }}>
                Enriched K-Line
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', mt: 1 }}>
                Penggunaan kuota 3-5 kaunter teratas bagi setiap lorong untuk muat turun carta bar terperinci.
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 2.4 }}>
            <Box sx={{ p: 1.5, borderRadius: '8px', backgroundColor: (t) => t.palette.mode === 'dark' ? '#2f3045' : '#f8f9fa', height: '100%' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: sneatTokens.success.main, display: 'block' }}>
                STAGE 5
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 0.5 }}>
                Watchlist Akhir
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.8rem', mt: 1 }}>
                Senarai muktamad diserahkan kepada agen Tariq (Technical) &amp; Nawwar (Fundamental).
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
