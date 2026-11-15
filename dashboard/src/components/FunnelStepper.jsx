import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Grid,
  Paper,
  Chip,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { sneatTokens } from '../theme';

export function FunnelStepper({ dataPayload }) {
  const watchlist = dataPayload?.watchlist || {};
  const funnel = watchlist.funnel || {
    stage1_universe: 8520,
    stage2_quality: 1420,
    stage3_dual_lane: 48,
    stage4_kline: 10,
    stage5_final: (watchlist.watchlist || []).length || 8,
  };

  const steps = [
    {
      stage: 'Peringkat 1',
      title: 'Cloud Universe',
      count: funnel.stage1_universe || 8500,
      unit: 'Kaunter',
      desc: 'Semua saham US aktif di Moomoo',
      color: sneatTokens.secondary.main,
      bg: sneatTokens.secondary.soft,
    },
    {
      stage: 'Peringkat 2',
      title: 'Kualiti Stage 0',
      count: funnel.stage2_quality || 1400,
      unit: 'Kaunter',
      desc: 'Harga >= $10, Cap >= $1B, ADV >= 1M',
      color: sneatTokens.info.main,
      bg: sneatTokens.info.soft,
    },
    {
      stage: 'Peringkat 3',
      title: 'Dwi-Lorong',
      count: funnel.stage3_dual_lane || 45,
      unit: 'Calon',
      desc: 'Momentum & Setup RS vs SPY',
      color: sneatTokens.warning.main,
      bg: sneatTokens.warning.soft,
    },
    {
      stage: 'Peringkat 4',
      title: 'Enriched K-Line',
      count: funnel.stage4_kline || 10,
      unit: 'Teratas',
      desc: 'Kuota API 3-5 kaunter per lorong',
      color: sneatTokens.primary.main,
      bg: sneatTokens.primary.soft,
    },
    {
      stage: 'Peringkat 5',
      title: 'Watchlist Akhir',
      count: funnel.stage5_final || (watchlist.watchlist || []).length || 6,
      unit: 'Saham Terpilih',
      desc: 'Sedia untuk eksekusi Tariq & Nawwar',
      color: sneatTokens.success.main,
      bg: sneatTokens.success.soft,
    },
  ];

  return (
    <Box id="funnel" sx={{ mb: 4 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <FilterListIcon sx={{ color: sneatTokens.primary.main }} />
        Corong Saringan 5-Peringkat (5-Stage Screening Funnel)
      </Typography>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Grid container spacing={2} alignItems="center">
            {steps.map((step, idx) => (
              <React.Fragment key={step.stage}>
                <Grid item xs={12} sm={6} md={2.4}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      borderRadius: '8px',
                      backgroundColor: step.bg,
                      border: `1px solid ${step.color}30`,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Chip
                        size="small"
                        label={step.stage}
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.68rem',
                          backgroundColor: `${step.color}25`,
                          color: step.color,
                        }}
                      />
                      {idx === steps.length - 1 && (
                        <CheckCircleIcon sx={{ fontSize: 18, color: step.color }} />
                      )}
                    </Box>

                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: step.color, mt: 0.5 }}>
                      {step.title}
                    </Typography>

                    <Box sx={{ my: 1 }}>
                      <Typography variant="h5" sx={{ fontWeight: 800, color: 'text.primary' }}>
                        {Number(step.count).toLocaleString()}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                        {step.unit}
                      </Typography>
                    </Box>

                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.72rem', mt: 0.5 }}>
                      {step.desc}
                    </Typography>
                  </Paper>
                </Grid>
              </React.Fragment>
            ))}
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}
