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
  const funnel = watchlist.funnel || {};

  const rawWatchlist = Array.isArray(watchlist)
    ? watchlist
    : (Array.isArray(watchlist.watchlist) ? watchlist.watchlist : (watchlist.items || []));

  const stage1Count = funnel.cloud_raw_returned ?? funnel.stage1_universe ?? (watchlist.total_screened_cloud || 0);
  const stage2Count = funnel.stage0_quality_passed ?? funnel.stage2_quality ?? (watchlist.stage1_passed || 0);
  const stage3Count = (funnel.lane_momentum_candidates !== undefined || funnel.lane_setup_candidates !== undefined)
    ? ((funnel.lane_momentum_candidates || 0) + (funnel.lane_setup_candidates || 0))
    : (funnel.stage3_dual_lane ?? watchlist.stage2_passed ?? 0);
  const stage4Count = funnel.kline_analyzed_count ?? funnel.stage4_kline ?? 0;
  const stage5Count = funnel.final_watchlist_count ?? rawWatchlist.length;

  const steps = [
    {
      stage: 'Peringkat 1',
      title: 'Cloud Universe',
      count: stage1Count,
      unit: 'Kaunter',
      desc: 'Semua saham US aktif di Moomoo',
      color: sneatTokens.secondary.main,
      bg: sneatTokens.secondary.soft,
    },
    {
      stage: 'Peringkat 2',
      title: 'Kualiti Stage 0',
      count: stage2Count,
      unit: 'Kaunter',
      desc: 'Harga >= $10, Cap >= $1B, ADV >= 1M',
      color: sneatTokens.info.main,
      bg: sneatTokens.info.soft,
    },
    {
      stage: 'Peringkat 3',
      title: 'Dwi-Lorong',
      count: stage3Count,
      unit: 'Calon',
      desc: 'Momentum & Setup RS vs SPY',
      color: sneatTokens.warning.main,
      bg: sneatTokens.warning.soft,
    },
    {
      stage: 'Peringkat 4',
      title: 'Enriched K-Line',
      count: stage4Count,
      unit: 'Teratas',
      desc: 'Kuota API 3-5 kaunter per lorong',
      color: sneatTokens.primary.main,
      bg: sneatTokens.primary.soft,
    },
    {
      stage: 'Peringkat 5',
      title: 'Watchlist Akhir',
      count: stage5Count,
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
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          backgroundColor: 'background.paper',
                          color: step.color,
                        }}
                      />
                      {idx === steps.length - 1 && (
                        <CheckCircleIcon sx={{ color: sneatTokens.success.main, fontSize: 18 }} />
                      )}
                    </Box>

                    <Box sx={{ my: 1 }}>
                      <Typography variant="h4" sx={{ fontWeight: 800, color: step.color }}>
                        {step.count.toLocaleString()}
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                        {step.unit}
                      </Typography>
                    </Box>

                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                        {step.title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
                        {step.desc}
                      </Typography>
                    </Box>
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
