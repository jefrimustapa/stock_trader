import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Paper,
  Chip,
  Button,
  Divider,
} from '@mui/material';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InsightsIcon from '@mui/icons-material/Insights';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import StarsIcon from '@mui/icons-material/Stars';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ViewListIcon from '@mui/icons-material/ViewList';
import { sneatTokens } from '../theme';
import { FunnelStepper } from '../components/FunnelStepper';
import { getStage0Detail, getStage3Detail } from '../utils/formatters';

export function FunnelPage({ dataPayload, screenerConfig, configLoading, configError }) {
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

  const finalCount = funnel.final_watchlist_count ?? rawWatchlist.length;
  const universeCount = funnel.cloud_raw_returned ?? funnel.stage1_universe ?? (watchlist.total_screened_cloud || 0);
  const conversionPct = universeCount > 0 ? ((finalCount / universeCount) * 100).toFixed(2) : '0.00';

  const criteriaCards = [
    {
      stage: 'STAGE 1',
      title: 'Cloud Universe',
      icon: <CloudQueueIcon sx={{ fontSize: 18 }} />,
      color: sneatTokens.secondary.main,
      bg: sneatTokens.secondary.soft,
      desc: 'Raw cloud screening fetches thousands of active US symbols for initial filtering.',
      badge: 'NYSE & NASDAQ',
    },
    {
      stage: 'STAGE 2',
      title: 'Stage 0 Quality',
      icon: <VerifiedUserIcon sx={{ fontSize: 18 }} />,
      color: sneatTokens.info.main,
      bg: sneatTokens.info.soft,
      desc: getStage0Detail(activeConfig, status),
      badge: 'Baseline Filters',
    },
    {
      stage: 'STAGE 3',
      title: 'Dual-Lane',
      icon: <AltRouteIcon sx={{ fontSize: 18 }} />,
      color: sneatTokens.warning.main,
      bg: sneatTokens.warning.soft,
      desc: getStage3Detail(activeConfig, status),
      badge: 'RS vs SPY',
    },
    {
      stage: 'STAGE 4',
      title: 'Enriched K-Line',
      icon: <ShowChartIcon sx={{ fontSize: 18 }} />,
      color: sneatTokens.primary.main,
      bg: sneatTokens.primary.soft,
      desc: 'High-precision K-line candlestick retrieval for top 3-5 candidates per lane to optimize API quota.',
      badge: 'Quota Optimized',
    },
    {
      stage: 'STAGE 5',
      title: 'Final Watchlist',
      icon: <StarsIcon sx={{ fontSize: 18 }} />,
      color: sneatTokens.success.main,
      bg: sneatTokens.success.soft,
      desc: 'Selected stocks ready for Tariq (technical) and Nawwar (fundamental) agent processing.',
      badge: 'Trade Ready',
    },
  ];

  return (
    <Box id="page-funnel" sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 2.5, sm: 3 } }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '8px',
              backgroundColor: sneatTokens.info.soft,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: sneatTokens.info.main,
              boxShadow: '0 2px 8px 0 rgba(3, 195, 236, 0.25)',
              flexShrink: 0,
            }}
          >
            <FilterAltIcon sx={{ fontSize: 24 }} />
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
              5-Stage Stock Screening Funnel
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25, fontSize: { xs: '0.78rem', sm: '0.85rem' } }}>
              Hybrid screening architecture (HOM-178 Approach C): progressive filtering from thousands of US stocks to high-quality candidates.
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            label={`Selectivity: ${conversionPct}%`}
            sx={{
              fontWeight: 700,
              backgroundColor: sneatTokens.primary.soft,
              color: sneatTokens.primary.main,
              borderRadius: 1.5,
            }}
          />
          <Chip
            size="small"
            label={`${finalCount} Final Candidates`}
            sx={{
              fontWeight: 700,
              backgroundColor: sneatTokens.success.soft,
              color: sneatTokens.success.main,
              borderRadius: 1.5,
            }}
          />
        </Box>
      </Box>

      {/* Funnel Stepper Component */}
      <FunnelStepper
        dataPayload={dataPayload}
        screenerConfig={activeConfig}
        configLoading={loading}
        configError={error}
      />

      {/* Funnel Stage Criteria Details Card */}
      <Card
        sx={{
          borderRadius: '10px',
          border: (t) => `1px solid ${t.palette.divider}`,
          boxShadow: (t) => t.palette.mode === 'dark'
            ? '0 2px 14px 0 rgba(0, 0, 0, 0.28)'
            : '0 2px 10px 0 rgba(67, 89, 113, 0.08)',
          overflow: 'hidden',
        }}
      >
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: '8px',
                backgroundColor: sneatTokens.primary.soft,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: sneatTokens.primary.main,
              }}
            >
              <InsightsIcon sx={{ fontSize: 20 }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
                Stage Criteria Description
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                Technical specifications and filtering criteria for each screening funnel stage
              </Typography>
            </Box>
          </Box>
        </Box>

        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Grid container spacing={2}>
            {criteriaCards.map((c) => (
              <Grid item xs={12} sm={6} md={2.4} key={c.stage}>
                <Paper
                  id={c.stage === 'STAGE 2' ? 'card-criteria-stage2' : undefined}
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: '8px',
                    backgroundColor: (t) => t.palette.mode === 'dark' ? '#252636' : '#FFFFFF',
                    border: (t) => `1px solid ${c.color}35`,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    '&:hover': {
                      borderColor: c.color,
                      boxShadow: (t) => `0 4px 12px 0 ${c.color}20`,
                    },
                  }}
                >
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Chip
                        size="small"
                        label={c.stage}
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.68rem',
                          backgroundColor: c.bg,
                          color: c.color,
                          borderRadius: 1.5,
                        }}
                      />
                      <Box sx={{ color: c.color }}>
                        {c.icon}
                      </Box>
                    </Box>

                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 1, color: 'text.primary' }}>
                      {c.title}
                    </Typography>

                    <Typography
                      id={c.stage === 'STAGE 2' ? 'criteria-stage2-desc' : undefined}
                      data-testid={c.stage === 'STAGE 2' ? 'criteria-stage2-desc' : undefined}
                      variant="body2"
                      sx={{
                        color: 'text.secondary',
                        display: 'block',
                        mt: 1,
                        fontSize: '0.78rem',
                        lineHeight: 1.5,
                      }}
                    >
                      {c.desc}
                    </Typography>
                  </Box>

                  <Box sx={{ mt: 2, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                    <Chip
                      size="small"
                      label={c.badge}
                      variant="outlined"
                      sx={{
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        borderColor: `${c.color}60`,
                        color: c.color,
                        borderRadius: 1,
                      }}
                    />
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>

          {/* Quick Action Link to Watchlist */}
          <Box
            sx={{
              mt: 3,
              p: 2,
              borderRadius: '8px',
              backgroundColor: (t) => t.palette.mode === 'dark' ? 'rgba(105, 108, 255, 0.08)' : 'rgba(105, 108, 255, 0.04)',
              border: (t) => `1px solid ${sneatTokens.primary.main}30`,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 2,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
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
                <ViewListIcon sx={{ fontSize: 20 }} />
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  View Selected Stock Results
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {finalCount} symbols passed all 5 funnel stages and are ready for monitoring in the Dual-Lane Watchlist.
                </Typography>
              </Box>
            </Box>

            <Button
              component="a"
              href="#/watchlist"
              variant="contained"
              size="small"
              endIcon={<ArrowForwardIcon />}
              sx={{
                borderRadius: 1.5,
                fontWeight: 600,
                backgroundColor: sneatTokens.primary.main,
                color: '#FFFFFF',
                px: 2,
              }}
            >
              Open Watchlist Table
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
