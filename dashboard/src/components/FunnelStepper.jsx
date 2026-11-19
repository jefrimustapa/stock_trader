import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Grid,
  Paper,
  Chip,
  LinearProgress,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { sneatTokens } from '../theme';
import { getStage0Summary, getStage3Summary } from '../utils/formatters';

export function FunnelStepper({ dataPayload, screenerConfig, configLoading, configError }) {
  const [localConfig, setLocalConfig] = useState(
    screenerConfig || dataPayload?.screenerConfig || null
  );
  const [loading, setLoading] = useState(
    screenerConfig !== undefined
      ? Boolean(configLoading)
      : (dataPayload?.screenerConfig ? false : true)
  );
  const [error, setError] = useState(Boolean(configError));

  useEffect(() => {
    if (screenerConfig !== undefined) {
      setLocalConfig(screenerConfig);
      setLoading(Boolean(configLoading));
      setError(Boolean(configError));
      return;
    }
    if (dataPayload?.screenerConfig) {
      setLocalConfig(dataPayload.screenerConfig);
      setLoading(false);
      setError(false);
      return;
    }
    let isMounted = true;
    async function fetchConfig() {
      try {
        setLoading(true);
        const res = await fetch('/api/screener/config');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (isMounted) {
          setLocalConfig(data?.config || null);
          setError(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(true);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    fetchConfig();
    return () => {
      isMounted = false;
    };
  }, [screenerConfig, configLoading, configError, dataPayload?.screenerConfig]);

  const activeConfig = screenerConfig !== undefined ? screenerConfig : (localConfig || dataPayload?.screenerConfig);
  const status = loading ? 'loading' : (error || !activeConfig ? 'error' : 'ready');

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
      ratio: '100% Pasaran',
      color: sneatTokens.secondary.main,
      bg: sneatTokens.secondary.soft,
      icon: <CloudQueueIcon sx={{ fontSize: 20 }} />,
    },
    {
      stage: 'Peringkat 2',
      title: 'Kualiti Stage 0',
      count: stage2Count,
      unit: 'Kaunter',
      desc: getStage0Summary(activeConfig, status),
      ratio: stage1Count > 0 ? `${((stage2Count / stage1Count) * 100).toFixed(1)}% Lolos` : '16.7% Lolos',
      color: sneatTokens.info.main,
      bg: sneatTokens.info.soft,
      icon: <VerifiedUserIcon sx={{ fontSize: 20 }} />,
    },
    {
      stage: 'Peringkat 3',
      title: 'Dwi-Lorong',
      count: stage3Count,
      unit: 'Calon',
      desc: getStage3Summary(activeConfig, status),
      ratio: stage2Count > 0 ? `${((stage3Count / stage2Count) * 100).toFixed(1)}% Dwi-Lorong` : '3.4% Calon',
      color: sneatTokens.warning.main,
      bg: sneatTokens.warning.soft,
      icon: <AltRouteIcon sx={{ fontSize: 20 }} />,
    },
    {
      stage: 'Peringkat 4',
      title: 'Enriched K-Line',
      count: stage4Count,
      unit: 'Teratas',
      desc: 'Kuota API 3-5 kaunter per lorong',
      ratio: 'Kuota API Fokus',
      color: sneatTokens.primary.main,
      bg: sneatTokens.primary.soft,
      icon: <ShowChartIcon sx={{ fontSize: 20 }} />,
    },
    {
      stage: 'Peringkat 5',
      title: 'Watchlist Akhir',
      count: stage5Count,
      unit: 'Saham Terpilih',
      desc: 'Sedia untuk eksekusi Tariq & Nawwar',
      ratio: 'Sedia Eksekusi',
      color: sneatTokens.success.main,
      bg: sneatTokens.success.soft,
      icon: <CheckCircleIcon sx={{ fontSize: 20 }} />,
    },
  ];

  return (
    <Box id="funnel" sx={{ width: '100%' }}>
      <Card
        sx={{
          borderRadius: '10px',
          overflow: 'hidden',
          border: (t) => `1px solid ${t.palette.divider}`,
          boxShadow: (t) => t.palette.mode === 'dark'
            ? '0 2px 14px 0 rgba(0, 0, 0, 0.28)'
            : '0 2px 10px 0 rgba(67, 89, 113, 0.08)',
        }}
      >
        {/* Card Header Toolbar */}
        <Box
          sx={{
            p: { xs: 2, sm: 2.5 },
            pb: { xs: 1.5, sm: 2 },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
            backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(255,255,255,0.01)' : '#FAFAFC',
          }}
        >
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
                boxShadow: '0 2px 6px 0 rgba(105, 108, 255, 0.2)',
              }}
            >
              <FilterListIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
                Saluran Penapisan Corong 5-Peringkat
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                Penapisan kuantitatif bertingkat dari Cloud Universe sehingga Calon Akhir
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* 5-Stage Step Grid */}
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Grid container spacing={2} alignItems="stretch">
            {steps.map((step, idx) => (
              <Grid item xs={12} sm={6} md={2.4} key={step.stage}>
                <Paper
                  id={step.stage === 'Peringkat 2' ? 'card-funnel-stage2' : undefined}
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: '8px',
                    backgroundColor: (t) => t.palette.mode === 'dark' ? '#252636' : '#FFFFFF',
                    border: (t) => `1px solid ${step.color}40`,
                    boxShadow: (t) => t.palette.mode === 'dark'
                      ? '0 2px 6px 0 rgba(0,0,0,0.2)'
                      : '0 2px 6px 0 rgba(67, 89, 113, 0.05)',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: (t) => `0 4px 12px 0 ${step.color}25`,
                    },
                  }}
                >
                  {/* Top Bar of Card: Stage Chip & Icon */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                    <Chip
                      size="small"
                      label={step.stage}
                      sx={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        backgroundColor: step.bg,
                        color: step.color,
                        borderRadius: 1.5,
                        px: 0.5,
                      }}
                    />
                    <Box
                      sx={{
                        width: 30,
                        height: 30,
                        borderRadius: '6px',
                        backgroundColor: step.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: step.color,
                      }}
                    >
                      {step.icon}
                    </Box>
                  </Box>

                  {/* Metric Number */}
                  <Box sx={{ my: 1 }}>
                    <Typography
                      variant="h4"
                      sx={{
                        fontWeight: 800,
                        color: step.color,
                        lineHeight: 1.1,
                        fontSize: { xs: '1.75rem', sm: '2rem' },
                      }}
                    >
                      {step.count.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mt: 0.25 }}>
                      {step.unit}
                    </Typography>
                  </Box>

                  {/* Title & Description */}
                  <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'text.primary' }}>
                      {step.title}
                    </Typography>
                    <Typography
                      id={step.stage === 'Peringkat 2' ? 'funnel-stage2-desc' : undefined}
                      data-testid={step.stage === 'Peringkat 2' ? 'funnel-stage2-desc' : undefined}
                      variant="caption"
                      sx={{
                        color: 'text.secondary',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        mt: 0.5,
                        lineHeight: 1.3,
                        fontSize: '0.72rem',
                      }}
                    >
                      {step.desc}
                    </Typography>
                  </Box>

                  {/* Ratio / Conversion Footer */}
                  <Box sx={{ mt: 1.5, pt: 1, borderTop: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 700, color: step.color }}>
                      {step.ratio}
                    </Typography>
                    {idx < steps.length - 1 ? (
                      <ArrowForwardIcon sx={{ fontSize: 14, color: 'text.secondary', opacity: 0.6 }} />
                    ) : (
                      <CheckCircleIcon sx={{ fontSize: 14, color: sneatTokens.success.main }} />
                    )}
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}
