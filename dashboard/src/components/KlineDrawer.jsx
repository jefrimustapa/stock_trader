import React, { useState, useEffect, useRef } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  ButtonGroup,
  Button,
  CircularProgress,
  Chip,
  Card,
  CardContent,
  useTheme,
  useMediaQuery,
  Divider,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LaunchIcon from '@mui/icons-material/Launch';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import axios from 'axios';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, CrosshairMode, LineStyle } from 'lightweight-charts';
import { sneatTokens } from '../theme';

function formatVol(val) {
  const n = Number(val || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n > 0 ? n.toFixed(0) : '0';
}

const TIMEFRAMES = [
  { label: '1D', value: 'day' },
  { label: '15M', value: '15m' },
  { label: '5M', value: '5m' },
  { label: '1M', value: '1m' },
];

export function KlineDrawer({ open, onClose, stock }) {
  const theme = useTheme();
  const isSmallHeight = useMediaQuery('(max-height: 560px)');
  const isMobilePortrait = useMediaQuery(theme.breakpoints.down('sm')) && !isSmallHeight;
  const isMobileLandscape = isSmallHeight;
  const isMobile = isMobilePortrait || isMobileLandscape;
  const isDark = theme.palette.mode === 'dark';

  const [interval, setInterval] = useState('day');
  const [loading, setLoading] = useState(false);
  const [klineData, setKlineData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [hoverOhlc, setHoverOhlc] = useState(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [zoomMode, setZoomMode] = useState('40');
  const [visibleCandleCount, setVisibleCandleCount] = useState(40);

  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const activeSubRef = useRef({ symbol: null, interval: null });
  const programmaticModeRef = useRef('40');

  const getCandleCountLabel = () => {
    const total = klineData?.candles?.length || 0;
    if (total === 0) return '0 lilin';
    if (zoomMode === 'all') {
      return `${total} lilin`;
    }
    if (zoomMode === '40') {
      if (total <= 40) return `${total} lilin`;
      return `40 / ${total} lilin`;
    }
    // zoomMode === 'custom'
    const count = Math.min(total, Math.max(0, visibleCandleCount));
    if (count >= total) return `${total} lilin`;
    return `${count} / ${total} lilin`;
  };

  const handleShowRecent = () => {
    if (!chartInstanceRef.current || !klineData?.candles?.length) return;
    programmaticModeRef.current = '40';
    setZoomMode('40');
    const total = klineData.candles.length;
    if (total < 10) {
      chartInstanceRef.current.timeScale().setVisibleLogicalRange({
        from: -15,
        to: 15,
      });
    } else {
      chartInstanceRef.current.timeScale().setVisibleLogicalRange({
        from: Math.max(0, total - (isMobile ? 25 : 42)),
        to: total + 2,
      });
    }
    setVisibleCandleCount(Math.min(total, 40));
  };

  const handleFitAll = () => {
    if (!chartInstanceRef.current) return;
    programmaticModeRef.current = 'all';
    setZoomMode('all');
    chartInstanceRef.current.timeScale().fitContent();
    if (klineData?.candles?.length) {
      setVisibleCandleCount(klineData.candles.length);
    }
  };

  const handleZoomIn = () => {
    if (!chartInstanceRef.current) return;
    programmaticModeRef.current = null;
    setZoomMode('custom');
    const ts = chartInstanceRef.current.timeScale();
    const current = ts.options().barSpacing || 14;
    ts.applyOptions({ barSpacing: Math.min(50, current * 1.35) });
  };

  const handleZoomOut = () => {
    if (!chartInstanceRef.current) return;
    programmaticModeRef.current = null;
    setZoomMode('custom');
    const ts = chartInstanceRef.current.timeScale();
    const current = ts.options().barSpacing || 14;
    ts.applyOptions({ barSpacing: Math.max(3, current * 0.72) });
  };

  const symbol = stock?.symbol || '';
  const companyName = stock?.name || stock?.company_name || 'US Equities';
  const price = stock?.price ?? stock?.close ?? 0;
  const changePct = stock?.change_pct ?? stock?.change ?? 0;
  const isPositive = Number(changePct) >= 0;

  // Release subscription when closing or changing stock/timeframe
  const releaseActiveSubscription = async (sym, intv) => {
    if (!sym) return;
    try {
      await axios.post('/api/kline/release', {
        symbol: sym,
        interval: intv || 'day',
      });
    } catch (err) {
      // Ignore background release error
    }
  };

  const fetchKline = async (sym, intv) => {
    if (!sym) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await axios.get('/api/kline', {
        params: {
          symbol: sym,
          interval: intv,
          num: 150,
        },
      });
      const data = res.data;
      setKlineData(data);
      activeSubRef.current = { symbol: sym, interval: intv };

      if (data.status !== 'HEALTHY') {
        setErrorMsg(data.error || 'Data Graf K-line Moomoo Tidak Tersedia');
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Ralat sambungan pelayan';
      setErrorMsg(msg);
      setKlineData({
        status: 'UNAVAILABLE',
        connected: false,
        opend_status: 'DISCONNECTED',
        candles: [],
        error: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && symbol) {
      // Release previous active subscription when switching timeframe or symbol
      if (
        activeSubRef.current.symbol &&
        (activeSubRef.current.symbol !== symbol || activeSubRef.current.interval !== interval)
      ) {
        releaseActiveSubscription(activeSubRef.current.symbol, activeSubRef.current.interval);
        activeSubRef.current = { symbol: null, interval: null };
      }
      fetchKline(symbol, interval);
    } else if (!open && activeSubRef.current.symbol) {
      // Release subscription when drawer closes
      releaseActiveSubscription(activeSubRef.current.symbol, activeSubRef.current.interval);
      activeSubRef.current = { symbol: null, interval: null };
      setKlineData(null);
      setErrorMsg(null);
      setInterval('day');
    }
  }, [open, symbol, interval]);

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (activeSubRef.current.symbol) {
        releaseActiveSubscription(activeSubRef.current.symbol, activeSubRef.current.interval);
        activeSubRef.current = { symbol: null, interval: null };
      }
    };
  }, []);

  // Handle tab close / reload / pagehide via sendBeacon / keepalive fetch
  useEffect(() => {
    const handleUnload = () => {
      const cur = activeSubRef.current;
      if (cur && cur.symbol) {
        const payload = JSON.stringify({
          symbol: cur.symbol,
          interval: cur.interval || 'day',
        });
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon('/api/kline/release', blob);
        } else {
          fetch('/api/kline/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      }
    };

    window.addEventListener('pagehide', handleUnload);
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);

  // Handle drawer close
  const handleClose = () => {
    if (activeSubRef.current.symbol) {
      releaseActiveSubscription(activeSubRef.current.symbol, activeSubRef.current.interval);
      activeSubRef.current = { symbol: null, interval: null };
    }
    setKlineData(null);
    setErrorMsg(null);
    setInterval('day');
    setZoomMode('40');
    setVisibleCandleCount(40);
    programmaticModeRef.current = '40';
    onClose();
  };

  // Render TradingView Lightweight Chart
  useEffect(() => {
    if (!open || loading || !chartContainerRef.current) return;
    if (!klineData || klineData.status !== 'HEALTHY' || !Array.isArray(klineData.candles) || klineData.candles.length === 0) {
      return;
    }

    // Clean up existing chart
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const container = chartContainerRef.current;
    const initialHeight = container.clientHeight > 0
      ? container.clientHeight
      : (isSmallHeight ? 220 : isMobilePortrait ? 280 : 460);
    const chartHeight = Math.max(160, initialHeight);
    const chart = createChart(container, {
      width: container.clientWidth || 590,
      height: chartHeight,
      layout: {
        background: {
          type: ColorType.Solid,
          color: isDark ? '#1E1E2D' : '#FAFAFC',
        },
        textColor: isDark ? '#A1A5B7' : '#5E6278',
        fontSize: 12,
        fontFamily: "'Public Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      },
      grid: {
        vertLines: {
          color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(76, 78, 100, 0.06)',
          style: LineStyle.Dotted,
        },
        horzLines: {
          color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(76, 78, 100, 0.06)',
          style: LineStyle.Dotted,
        },
      },
      rightPriceScale: {
        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(76, 78, 100, 0.12)',
        scaleMargins: {
          top: 0.08,
          bottom: 0.22,
        },
      },
      timeScale: {
        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(76, 78, 100, 0.12)',
        timeVisible: interval !== 'day',
        secondsVisible: false,
        barSpacing: 14,
        minBarSpacing: 4,
        rightOffset: 6,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(105, 108, 255, 0.65)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#696CFF',
        },
        horzLine: {
          color: 'rgba(105, 108, 255, 0.65)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#696CFF',
        },
      },
    });

    chartInstanceRef.current = chart;

    // Candlestick Series - high contrast vibrant colors
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#28C76F',
      downColor: '#EA5455',
      borderVisible: true,
      borderUpColor: '#28C76F',
      borderDownColor: '#EA5455',
      wickVisible: true,
      wickUpColor: '#28C76F',
      wickDownColor: '#EA5455',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    // Volume Series - dedicated volume scale without price axis ticks
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol_scale',
    });

    chart.priceScale('vol_scale').applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
      visible: false,
    });

    candleSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.08,
        bottom: 0.22,
      },
    });

    // Format candles for lightweight-charts
    const sortedCandles = [...klineData.candles].sort((a, b) => {
      const ta = typeof a.time === 'number' ? a.time : (a.timestamp || new Date(a.time).getTime());
      const tb = typeof b.time === 'number' ? b.time : (b.timestamp || new Date(b.time).getTime());
      return ta - tb;
    });

    // Deduplicate timestamps
    const seenTimes = new Set();
    const formattedCandles = [];
    const formattedVolumes = [];

    for (const c of sortedCandles) {
      let timeVal = c.time || c.timestamp;
      if (!timeVal) continue;
      if (typeof timeVal === 'string') {
        if (interval === 'day' && timeVal.includes(' ')) {
          timeVal = timeVal.split(' ')[0];
        } else if (interval !== 'day' && timeVal.includes(' ')) {
          timeVal = Math.floor(new Date(timeVal).getTime() / 1000);
        }
      }
      const timeKey = String(timeVal);
      if (seenTimes.has(timeKey)) continue;
      seenTimes.add(timeKey);

      formattedCandles.push({
        time: timeVal,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      });

      const isUp = Number(c.close) >= Number(c.open);
      formattedVolumes.push({
        time: timeVal,
        value: Number(c.volume || 0),
        color: isUp ? 'rgba(40, 199, 111, 0.45)' : 'rgba(234, 84, 85, 0.45)',
      });
    }

    candleSeries.setData(formattedCandles);
    volumeSeries.setData(formattedVolumes);

    // Initial comfortable zoom showing the latest 40 candles (or natural spacing if < 10 candles)
    const totalBars = formattedCandles.length;
    programmaticModeRef.current = '40';
    setZoomMode('40');
    setVisibleCandleCount(Math.min(totalBars, 40));

    if (totalBars > 0) {
      if (totalBars < 10) {
        chart.timeScale().setVisibleLogicalRange({
          from: -15,
          to: 15,
        });
      } else {
        const visibleCount = Math.min(totalBars, isMobile ? 25 : 42);
        chart.timeScale().setVisibleLogicalRange({
          from: Math.max(0, totalBars - visibleCount),
          to: totalBars + 2,
        });
      }
    }

    // Subscribe to visible logical range changes to track visible candle count & zoom mode
    const handleRangeChange = (newRange) => {
      if (!newRange) return;
      const from = Math.max(0, Math.ceil(newRange.from));
      const to = Math.min(totalBars - 1, Math.floor(newRange.to));
      const count = from <= to ? to - from + 1 : 0;
      setVisibleCandleCount(count);

      if (programmaticModeRef.current) {
        const activeProgMode = programmaticModeRef.current;
        setTimeout(() => {
          if (programmaticModeRef.current === activeProgMode) {
            programmaticModeRef.current = null;
          }
        }, 150);
      } else {
        setZoomMode('custom');
      }
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);

    // Subscribe to crosshair move for interactive OHLC HUD
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        setHoverOhlc(null);
        return;
      }
      const candle = param.seriesData.get(candleSeries);
      const vol = param.seriesData.get(volumeSeries);
      if (candle) {
        const isUp = Number(candle.close) >= Number(candle.open);
        setHoverOhlc({
          open: Number(candle.open),
          high: Number(candle.high),
          low: Number(candle.low),
          close: Number(candle.close),
          volume: vol?.value || 0,
          color: isUp ? '#28C76F' : '#EA5455',
          timeStr: typeof param.time === 'number'
            ? new Date(param.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : String(param.time).replace(/\s*00:00:00$/, ''),
        });
      } else {
        setHoverOhlc(null);
      }
    });

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width,
          height: height > 0 ? height : chartHeight,
        });
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeChange);
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [open, loading, klineData, isDark, interval, isSmallHeight, isMobileLandscape, isMobilePortrait]);

  const isHealthy = !loading && klineData?.status === 'HEALTHY' && Array.isArray(klineData.candles) && klineData.candles.length > 0;
  const isOtc = !loading && (
    klineData?.error_type === 'OTC_MARKET' ||
    (errorMsg && /OTC/i.test(errorMsg)) ||
    (symbol && symbol.replace(/^US\./, '').length === 5 && (symbol.endsWith('Y') || symbol.endsWith('F')))
  );
  const isOpenDDisconnected = !loading && !isOtc && (
    klineData?.connected === false ||
    klineData?.opend_status === 'DISCONNECTED' ||
    klineData?.opend_status === 'WAIT_LOGIN' ||
    (errorMsg && /OpenD|tidak dapat dihubungi|gateway belum/i.test(errorMsg))
  );
  const isQuotaFull = !loading && !isOtc && !isOpenDDisconnected && Boolean(errorMsg && /Had kuota langganan/i.test(errorMsg));
  const isUnavailable = !loading && (!isHealthy || !!errorMsg);

  const latestCandle = Array.isArray(klineData?.candles) && klineData.candles.length > 0
    ? klineData.candles[klineData.candles.length - 1]
    : null;

  const displayOhlc = hoverOhlc || (latestCandle ? {
    open: Number(latestCandle.open),
    high: Number(latestCandle.high),
    low: Number(latestCandle.low),
    close: Number(latestCandle.close),
    volume: Number(latestCandle.volume || 0),
    timeStr: (latestCandle.time_str || (latestCandle.time ? String(latestCandle.time) : '')).replace(/\s*00:00:00$/, ''),
    color: Number(latestCandle.close) >= Number(latestCandle.open) ? '#28C76F' : '#EA5455',
  } : null);

  return (
    <Drawer
      anchor={isMobilePortrait ? 'bottom' : 'right'}
      open={open}
      onClose={handleClose}
      slotProps={{
        backdrop: {
          sx: { backgroundColor: 'rgba(0, 0, 0, 0.45)' },
        },
      }}
      PaperProps={{
        sx: {
          width: isMobilePortrait ? '100%' : isMobileLandscape ? '100vw' : isMaximized ? '92vw' : 780,
          maxWidth: isMobilePortrait ? '100%' : isMobileLandscape ? '100vw' : isMaximized ? '96vw' : 840,
          height: isMobilePortrait ? 'calc(100dvh - 24px)' : isMobileLandscape ? '100vh' : '100%',
          maxHeight: isMobilePortrait ? 'calc(100dvh - 16px)' : '100%',
          transition: 'width 0.2s ease, max-width 0.2s ease, height 0.2s ease',
          borderTopLeftRadius: isMobilePortrait ? 16 : 0,
          borderTopRightRadius: isMobilePortrait ? 16 : 0,
          backgroundColor: (t) => (t.palette.mode === 'dark' ? '#2B2C40' : '#FFFFFF'),
          boxShadow: (t) =>
            t.palette.mode === 'dark'
              ? '-4px 0 24px rgba(0,0,0,0.45)'
              : '-4px 0 24px rgba(67, 89, 113, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}
    >
      {/* Mobile Portrait Sheet Puller */}
      {isMobilePortrait && (
        <Box
          sx={{
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)'),
            mx: 'auto',
            mt: 1,
            mb: 0.25,
            flexShrink: 0,
          }}
        />
      )}

      {/* Drawer Header */}
      <Box
        sx={{
          p: isSmallHeight ? 1 : isMobilePortrait ? 1.25 : 2.5,
          px: isSmallHeight ? 1.75 : isMobilePortrait ? 1.75 : 2.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          backgroundColor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#FAFAFC'),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <Box
            sx={{
              width: isSmallHeight ? 28 : isMobilePortrait ? 34 : 40,
              height: isSmallHeight ? 28 : isMobilePortrait ? 34 : 40,
              borderRadius: isSmallHeight ? 1.5 : 2,
              backgroundColor: sneatTokens.primary.soft,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: sneatTokens.primary.main,
              flexShrink: 0,
            }}
          >
            <ShowChartIcon fontSize={isSmallHeight ? "small" : "medium"} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant={isSmallHeight ? "subtitle1" : "h6"} sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                {symbol}
              </Typography>
              {isOtc && (
                <Chip
                  size="small"
                  label="OTC"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.68rem',
                    height: 20,
                    backgroundColor: sneatTokens.info.soft,
                    color: sneatTokens.info.main,
                  }}
                />
              )}
              {stock?.lane && (
                <Chip
                  size="small"
                  label={stock.lane}
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.68rem',
                    height: 20,
                    backgroundColor: String(stock.lane).toUpperCase() === 'MOMENTUM'
                      ? sneatTokens.primary.soft
                      : sneatTokens.warning.soft,
                    color: String(stock.lane).toUpperCase() === 'MOMENTUM'
                      ? sneatTokens.primary.main
                      : sneatTokens.warning.main,
                  }}
                />
              )}
            </Box>
            <Typography
              variant="caption"
              noWrap
              sx={{
                color: 'text.secondary',
                fontWeight: 500,
                display: isSmallHeight ? 'none' : 'block',
                maxWidth: isMobilePortrait ? 220 : 360,
              }}
            >
              {companyName}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title="Muat semula graf">
            <IconButton
              size="small"
              onClick={() => fetchKline(symbol, interval)}
              disabled={loading}
              title="Muat semula graf"
              aria-label="Muat semula graf"
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {!isMobile && (
            <Tooltip title={isMaximized ? "Kecilkan panel" : "Besarkan panel graf"}>
              <IconButton
                size="small"
                onClick={() => setIsMaximized(!isMaximized)}
                title={isMaximized ? "Kecilkan panel" : "Besarkan panel graf"}
                aria-label={isMaximized ? "Kecilkan panel" : "Besarkan panel graf"}
              >
                {isMaximized ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Tutup panel">
            <IconButton
              size="small"
              onClick={handleClose}
              title="Tutup panel"
              aria-label="Tutup panel"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Price Strip & Timeframe Selector Toolbar */}
      <Box
        sx={{
          px: isSmallHeight ? 1.75 : isMobilePortrait ? 2 : 2.5,
          py: isSmallHeight ? 0.6 : isMobilePortrait ? 0.9 : 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography variant={isSmallHeight ? "h6" : isMobilePortrait ? "h6" : "h5"} sx={{ fontWeight: 800 }}>
            ${Number(price).toFixed(2)}
          </Typography>
          <Chip
            size="small"
            label={`${isPositive ? '+' : ''}${Number(changePct).toFixed(2)}%`}
            sx={{
              fontWeight: 700,
              fontSize: '0.72rem',
              backgroundColor: isPositive ? sneatTokens.success.soft : sneatTokens.error.soft,
              color: isPositive ? sneatTokens.success.main : sneatTokens.error.main,
              borderRadius: 1,
              height: isSmallHeight ? 20 : 24,
            }}
          />
        </Box>

        <ButtonGroup size="small" variant="outlined" sx={{ borderRadius: 1.5, height: isSmallHeight ? 26 : 28 }}>
          {TIMEFRAMES.map((tf) => (
            <Button
              key={tf.value}
              onClick={() => setInterval(tf.value)}
              variant={interval === tf.value ? 'contained' : 'outlined'}
              sx={{
                fontWeight: 700,
                fontSize: '0.75rem',
                px: isSmallHeight ? 1 : isMobilePortrait ? 1.1 : 1.25,
                py: isSmallHeight ? 0.2 : 0.3,
                textTransform: 'none',
                minWidth: isSmallHeight ? 36 : 40,
                backgroundColor: interval === tf.value ? sneatTokens.primary.main : 'transparent',
                borderColor: sneatTokens.primary.main,
                '&:hover': {
                  backgroundColor: interval === tf.value ? sneatTokens.primary.dark : sneatTokens.primary.soft,
                },
              }}
            >
              {tf.label}
            </Button>
          ))}
        </ButtonGroup>
      </Box>

      {/* Drawer Body / Chart Area */}
      <Box
        sx={{
          flexGrow: 1,
          p: isSmallHeight ? 1 : isMobilePortrait ? 1.25 : 2,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isDark ? 'rgba(43, 44, 64, 0.85)' : 'rgba(255, 255, 255, 0.85)',
              zIndex: 10,
              gap: 2,
            }}
          >
            <CircularProgress size={36} sx={{ color: sneatTokens.primary.main }} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              Memuatkan data K-line {symbol} ({interval})...
            </Typography>
          </Box>
        )}

        {isUnavailable ? (
          <Box sx={{ p: 2, my: 'auto' }}>
            <Card
              sx={{
                borderRadius: 2,
                border: `1px solid ${
                  isOtc
                    ? sneatTokens.info.main
                    : isOpenDDisconnected
                    ? sneatTokens.warning.main
                    : sneatTokens.error.main
                }`,
                backgroundColor: isDark
                  ? isOtc
                    ? 'rgba(3, 195, 236, 0.08)'
                    : isOpenDDisconnected
                    ? 'rgba(255, 171, 0, 0.08)'
                    : 'rgba(255, 62, 29, 0.08)'
                  : isOtc
                  ? 'rgba(3, 195, 236, 0.06)'
                  : isOpenDDisconnected
                  ? 'rgba(255, 171, 0, 0.06)'
                  : 'rgba(255, 62, 29, 0.06)',
                boxShadow: 'none',
              }}
            >
              <CardContent sx={{ p: 2.5, textAlign: 'center' }}>
                {isOtc ? (
                  <>
                    <InfoOutlinedIcon sx={{ fontSize: 44, color: sneatTokens.info.main, mb: 1 }} />
                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: sneatTokens.info.main }}>
                      Pasaran OTC Tidak Disokong Moomoo OpenAPI
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: 440, mx: 'auto', lineHeight: 1.6 }}>
                      Kaunter <strong>{symbol}</strong> ({companyName}) didagangkan di pasaran Over-The-Counter (OTC) US.
                      Moomoo OpenAPI tidak menyediakan suapan data sebut harga atau graf K-line bagi kaunter pasaran OTC.
                    </Typography>
                    <Chip
                      size="small"
                      label="US OTC Market · Tiada Suapan Data Moomoo"
                      sx={{
                        mb: 2,
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        backgroundColor: sneatTokens.info.soft,
                        color: sneatTokens.info.main,
                      }}
                    />
                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 2.5 }}>
                      Sila pilih kaunter pasaran utama (NYSE / NASDAQ / AMEX) dalam senarai Watchlist untuk melihat graf candlestick masa nyata.
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={handleClose}
                        sx={{
                          backgroundColor: sneatTokens.primary.main,
                          color: '#fff',
                          fontWeight: 700,
                          textTransform: 'none',
                          '&:hover': { backgroundColor: sneatTokens.primary.dark },
                        }}
                      >
                        Tutup Panel
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<LaunchIcon />}
                        href={`https://finance.yahoo.com/quote/${symbol.replace(/^US\./, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ textTransform: 'none', fontWeight: 600 }}
                      >
                        Lihat di Yahoo Finance
                      </Button>
                    </Box>
                  </>
                ) : isOpenDDisconnected ? (
                  <>
                    <WarningAmberIcon sx={{ fontSize: 44, color: sneatTokens.warning.main, mb: 1 }} />
                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: isDark ? '#FFD071' : '#B87A00' }}>
                      Sambungan Moomoo OpenD Terputus
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: 420, mx: 'auto' }}>
                      Sambungan OpenD daemon terputus atau sesi belum disahkan. Graf K-line sebenar tidak dapat dimuatkan.
                      Tiada data lilin olok-olok dijana mengikut prinsip fail-closed.
                    </Typography>
                    {errorMsg && (
                      <Chip
                        size="small"
                        label={errorMsg}
                        sx={{
                          mb: 2.5,
                          fontWeight: 600,
                          fontSize: '0.72rem',
                          backgroundColor: 'rgba(255, 62, 29, 0.1)',
                          color: sneatTokens.error.main,
                          maxWidth: '100%',
                          height: 'auto',
                          py: 0.5,
                          '& .MuiChip-label': { whiteSpace: 'normal', textAlign: 'center' },
                        }}
                      />
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5 }}>
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<LaunchIcon />}
                        href="/opend"
                        sx={{
                          backgroundColor: sneatTokens.warning.main,
                          color: '#000',
                          fontWeight: 700,
                          textTransform: 'none',
                          '&:hover': { backgroundColor: sneatTokens.warning.dark },
                        }}
                      >
                        Buka Panel Kawalan OpenD
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => fetchKline(symbol, interval)}
                        sx={{ textTransform: 'none', fontWeight: 600 }}
                      >
                        Cuba Semula
                      </Button>
                    </Box>
                  </>
                ) : isQuotaFull ? (
                  <>
                    <WarningAmberIcon sx={{ fontSize: 44, color: sneatTokens.warning.main, mb: 1 }} />
                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: sneatTokens.warning.main }}>
                      Had Kuota Langganan OpenD Penuh
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: 420, mx: 'auto' }}>
                      Maksimum 100 slot langganan serentak Moomoo telah dicapai. Slot yang tidak digunakan akan dilepaskan secara automatik selepas tempoh pegangan minimum 60 saat tamat.
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5 }}>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => fetchKline(symbol, interval)}
                        sx={{
                          backgroundColor: sneatTokens.primary.main,
                          color: '#fff',
                          fontWeight: 700,
                          textTransform: 'none',
                        }}
                      >
                        Cuba Semula
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={handleClose}
                        sx={{ textTransform: 'none', fontWeight: 600 }}
                      >
                        Tutup Panel
                      </Button>
                    </Box>
                  </>
                ) : (
                  <>
                    <ErrorOutlineIcon sx={{ fontSize: 44, color: sneatTokens.error.main, mb: 1 }} />
                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: sneatTokens.error.main }}>
                      Data Graf K-line Tidak Tersedia
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: 420, mx: 'auto' }}>
                      Data K-line lilin untuk kaunter ini tidak dapat dimuatkan daripada Moomoo OpenAPI pada masa ini.
                    </Typography>
                    {errorMsg && (
                      <Chip
                        size="small"
                        label={errorMsg}
                        sx={{
                          mb: 2.5,
                          fontWeight: 600,
                          fontSize: '0.72rem',
                          backgroundColor: 'rgba(255, 62, 29, 0.1)',
                          color: sneatTokens.error.main,
                          maxWidth: '100%',
                          height: 'auto',
                          py: 0.5,
                          '& .MuiChip-label': { whiteSpace: 'normal', textAlign: 'center' },
                        }}
                      />
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5 }}>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => fetchKline(symbol, interval)}
                        sx={{
                          backgroundColor: sneatTokens.primary.main,
                          color: '#fff',
                          fontWeight: 700,
                          textTransform: 'none',
                        }}
                      >
                        Cuba Semula
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={handleClose}
                        sx={{ textTransform: 'none', fontWeight: 600 }}
                      >
                        Tutup Panel
                      </Button>
                    </Box>
                  </>
                )}
              </CardContent>
            </Card>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, minHeight: 0 }}>
            {/* Interactive OHLC HUD Bar */}
            <Box
              sx={{
                mb: isSmallHeight ? 0.75 : isMobilePortrait ? 1 : 1.5,
                px: isSmallHeight ? 1.25 : isMobilePortrait ? 1.25 : 2,
                py: isSmallHeight ? 0.4 : isMobilePortrait ? 0.6 : 1.2,
                borderRadius: 2,
                backgroundColor: isDark ? 'rgba(30, 30, 45, 0.95)' : '#FFFFFF',
                border: (t) => `1px solid ${t.palette.divider}`,
                boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(67, 89, 113, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: isMobilePortrait ? 'wrap' : 'nowrap',
                gap: isSmallHeight || isMobilePortrait ? 0.75 : 1.5,
                flexShrink: 0,
              }}
            >
              {displayOhlc ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: isSmallHeight || isMobilePortrait ? 1 : 1.75, flexWrap: isMobilePortrait ? 'wrap' : 'nowrap', minWidth: 0, overflow: 'hidden' }}>
                  <Chip
                    size="small"
                    label={displayOhlc.timeStr || interval.toUpperCase()}
                    sx={{
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      fontSize: isSmallHeight || isMobilePortrait ? '0.65rem' : '0.72rem',
                      height: isSmallHeight || isMobilePortrait ? 18 : 22,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(67, 89, 113, 0.08)',
                      color: 'text.primary',
                    }}
                  />
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem', fontWeight: 700 }}>O</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: isMobilePortrait ? '0.75rem' : '0.85rem', fontWeight: 800, color: displayOhlc.color }}>
                      ${displayOhlc.open?.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem', fontWeight: 700 }}>H</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: isMobilePortrait ? '0.75rem' : '0.85rem', fontWeight: 800, color: displayOhlc.color }}>
                      ${displayOhlc.high?.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem', fontWeight: 700 }}>L</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: isMobilePortrait ? '0.75rem' : '0.85rem', fontWeight: 800, color: displayOhlc.color }}>
                      ${displayOhlc.low?.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem', fontWeight: 700 }}>C</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: isMobilePortrait ? '0.75rem' : '0.85rem', fontWeight: 800, color: displayOhlc.color }}>
                      ${displayOhlc.close?.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem', fontWeight: 700 }}>Vol</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: isMobilePortrait ? '0.75rem' : '0.85rem', fontWeight: 800, color: 'text.primary' }}>
                      {formatVol(displayOhlc.volume)}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  Arahkan kursor ke graf untuk metrik lilin
                </Typography>
              )}

              {/* Zoom and Scale Controls */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <ButtonGroup
                  size="small"
                  variant="outlined"
                  sx={{
                    height: isSmallHeight || isMobilePortrait ? 22 : 26,
                    borderColor: `${sneatTokens.primary.main} !important`,
                    '& .MuiButtonGroup-grouped': {
                      borderColor: `${sneatTokens.primary.main} !important`,
                    },
                  }}
                >
                  <Button
                    onClick={handleShowRecent}
                    variant={zoomMode === '40' ? 'contained' : 'outlined'}
                    sx={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      textTransform: 'none',
                      px: isMobilePortrait ? 0.75 : 1,
                      minWidth: isMobilePortrait ? 50 : 58,
                      width: isMobilePortrait ? 50 : 58,
                      boxSizing: 'border-box',
                      backgroundColor: zoomMode === '40' ? sneatTokens.primary.main : 'transparent',
                      color: '#ffffff !important',
                      borderColor: `${sneatTokens.primary.main} !important`,
                      '&:hover': {
                        backgroundColor: zoomMode === '40' ? sneatTokens.primary.dark : sneatTokens.primary.soft,
                        borderColor: `${sneatTokens.primary.main} !important`,
                      },
                    }}
                    title="Fokus 40 lilin terkini"
                  >
                    40 Lilin
                  </Button>
                  <Button
                    onClick={handleFitAll}
                    variant={zoomMode === 'all' ? 'contained' : 'outlined'}
                    sx={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      textTransform: 'none',
                      px: isMobilePortrait ? 0.75 : 1,
                      minWidth: isMobilePortrait ? 46 : 54,
                      width: isMobilePortrait ? 46 : 54,
                      boxSizing: 'border-box',
                      backgroundColor: zoomMode === 'all' ? sneatTokens.primary.main : 'transparent',
                      color: '#ffffff !important',
                      borderColor: `${sneatTokens.primary.main} !important`,
                      '&:hover': {
                        backgroundColor: zoomMode === 'all' ? sneatTokens.primary.dark : sneatTokens.primary.soft,
                        borderColor: `${sneatTokens.primary.main} !important`,
                      },
                    }}
                    title="Papar semua lilin (Fit All)"
                  >
                    Semua
                  </Button>
                  <Button
                    onClick={handleZoomIn}
                    variant="outlined"
                    sx={{
                      px: 0.75,
                      minWidth: 26,
                      width: 26,
                      boxSizing: 'border-box',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#ffffff !important',
                      borderColor: `${sneatTokens.primary.main} !important`,
                      backgroundColor: 'transparent',
                      '&:hover': {
                        backgroundColor: sneatTokens.primary.soft,
                        borderColor: `${sneatTokens.primary.main} !important`,
                      },
                    }}
                    title="Zum Masuk (+)"
                  >
                    +
                  </Button>
                  <Button
                    onClick={handleZoomOut}
                    variant="outlined"
                    sx={{
                      px: 0.75,
                      minWidth: 26,
                      width: 26,
                      boxSizing: 'border-box',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#ffffff !important',
                      borderColor: `${sneatTokens.primary.main} !important`,
                      backgroundColor: 'transparent',
                      '&:hover': {
                        backgroundColor: sneatTokens.primary.soft,
                        borderColor: `${sneatTokens.primary.main} !important`,
                      },
                    }}
                    title="Zum Keluar (-)"
                  >
                    -
                  </Button>
                </ButtonGroup>
                {klineData?.cached && (
                  <Chip
                    size="small"
                    label="Cache"
                    sx={{
                      height: 18,
                      fontSize: '0.62rem',
                      backgroundColor: sneatTokens.info.soft,
                      color: sneatTokens.info.main,
                      fontWeight: 600,
                    }}
                  />
                )}
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    width: isMobilePortrait ? 76 : 85,
                    minWidth: isMobilePortrait ? 76 : 85,
                    textAlign: 'left',
                    display: 'inline-block',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {getCandleCountLabel()}
                </Typography>
              </Box>
            </Box>

            {/* Contextual Notice for Newly Listed Stocks (<= 3 daily candles) */}
            {interval === 'day' && klineData?.candles?.length <= 3 && (
              <Box
                sx={{
                  mb: isSmallHeight || isMobilePortrait ? 0.75 : 1.5,
                  px: isSmallHeight ? 1.25 : 2,
                  py: isSmallHeight || isMobilePortrait ? 0.5 : 1,
                  borderRadius: 1.5,
                  backgroundColor: 'rgba(3, 195, 236, 0.08)',
                  border: `1px solid ${sneatTokens.info.main}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 1,
                  flexShrink: 0,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <InfoOutlinedIcon sx={{ fontSize: 18, color: sneatTokens.info.main }} />
                  <Typography variant="caption" sx={{ color: sneatTokens.info.main, fontWeight: 700 }}>
                    Saham Penyenaraian Baharu (IPO): Hanya {klineData.candles.length} hari dagangan wujud sejak penyenaraian di bursa.
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => setInterval('15m')}
                  sx={{
                    py: 0.25,
                    px: 1.25,
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    textTransform: 'none',
                    backgroundColor: sneatTokens.info.main,
                    '&:hover': { backgroundColor: sneatTokens.info.dark },
                  }}
                >
                  Papar Lilin 15M (Intraday)
                </Button>
              </Box>
            )}

            {/* TradingView Canvas Container */}
            <Box
              ref={chartContainerRef}
              id="kline-chart-container"
              sx={{
                flex: 1,
                width: '100%',
                minHeight: isSmallHeight ? 140 : isMobilePortrait ? 200 : 420,
                borderRadius: 2,
                overflow: 'hidden',
                backgroundColor: isDark ? '#1E1E2D' : '#FAFAFC',
                border: (t) => `1px solid ${t.palette.divider}`,
                boxShadow: isDark ? 'inset 0 0 16px rgba(0,0,0,0.3)' : 'none',
              }}
            />

            {/* Bottom Status & Info Bar */}
            <Box sx={{ mt: isSmallHeight ? 0.5 : isMobilePortrait ? 0.75 : 1.5, display: isSmallHeight ? 'none' : 'flex', alignItems: 'center', justifyContent: 'space-between', px: 0.5, flexShrink: 0 }}>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: isMobilePortrait ? '0.62rem' : '0.68rem' }}>
                Sumber: Moomoo OpenAPI (K-line Semasa · Kuota Sejarah Sifar)
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: isMobilePortrait ? '0.62rem' : '0.68rem' }}>
                Pelepasan automatik selepas panel ditutup
              </Typography>
            </Box>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}

export default KlineDrawer;
