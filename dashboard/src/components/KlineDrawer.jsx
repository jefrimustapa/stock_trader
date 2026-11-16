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
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LaunchIcon from '@mui/icons-material/Launch';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
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
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isDark = theme.palette.mode === 'dark';

  const [interval, setInterval] = useState('day');
  const [loading, setLoading] = useState(false);
  const [klineData, setKlineData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [hoverOhlc, setHoverOhlc] = useState(null);

  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const activeSubRef = useRef({ symbol: null, interval: null });

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
      fetchKline(symbol, interval);
    } else if (!open && activeSubRef.current.symbol) {
      // Release subscription when drawer closes
      releaseActiveSubscription(activeSubRef.current.symbol, activeSubRef.current.interval);
      activeSubRef.current = { symbol: null, interval: null };
      setKlineData(null);
      setErrorMsg(null);
    }
  }, [open, symbol, interval]);

  // Handle drawer close
  const handleClose = () => {
    if (activeSubRef.current.symbol) {
      releaseActiveSubscription(activeSubRef.current.symbol, activeSubRef.current.interval);
      activeSubRef.current = { symbol: null, interval: null };
    }
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
    const chartHeight = Math.max(460, container.clientHeight || 480);
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
        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(76, 78, 100, 0.12)',
        scaleMargins: {
          top: 0.08,
          bottom: 0.25,
        },
      },
      timeScale: {
        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(76, 78, 100, 0.12)',
        timeVisible: interval !== 'day',
        secondsVisible: false,
        minBarSpacing: 5,
        rightOffset: 8,
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
      wickUpColor: '#28C76F',
      wickDownColor: '#EA5455',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    // Volume Series - histogram overlay confined strictly to bottom 20%
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '', // overlay
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    candleSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.08,
        bottom: 0.25,
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
      if (typeof timeVal === 'string' && timeVal.includes(' ') && interval !== 'day') {
        timeVal = Math.floor(new Date(timeVal).getTime() / 1000);
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

    chart.timeScale().applyOptions({
      barSpacing: formattedCandles.length < 30 ? 14 : 9,
    });
    chart.timeScale().fitContent();

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
            : String(param.time),
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
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [open, loading, klineData, isDark, interval]);

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
    timeStr: latestCandle.time_str || (latestCandle.time ? String(latestCandle.time) : ''),
    color: Number(latestCandle.close) >= Number(latestCandle.open) ? '#28C76F' : '#EA5455',
  } : null);

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      onClose={handleClose}
      slotProps={{
        backdrop: {
          sx: { backgroundColor: 'rgba(0, 0, 0, 0.45)' },
        },
      }}
      PaperProps={{
        sx: {
          width: isMobile ? '100%' : 640,
          maxWidth: '100%',
          height: isMobile ? '88vh' : '100%',
          borderTopLeftRadius: isMobile ? 16 : 0,
          borderTopRightRadius: isMobile ? 16 : 0,
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
      {/* Drawer Header */}
      <Box
        sx={{
          p: 2.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: (t) => (t.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#FAFAFC'),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2,
              backgroundColor: sneatTokens.primary.soft,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: sneatTokens.primary.main,
            }}
          >
            <ShowChartIcon fontSize="medium" />
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
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
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
              {companyName}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={() => fetchKline(symbol, interval)}
            disabled={loading}
            title="Muat semula graf"
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={handleClose} title="Tutup panel">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Price Strip & Timeframe Selector Toolbar */}
      <Box
        sx={{
          px: 2.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
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
            }}
          />
        </Box>

        <ButtonGroup size="small" variant="outlined" sx={{ borderRadius: 1.5 }}>
          {TIMEFRAMES.map((tf) => (
            <Button
              key={tf.value}
              onClick={() => setInterval(tf.value)}
              variant={interval === tf.value ? 'contained' : 'outlined'}
              sx={{
                fontWeight: 700,
                fontSize: '0.75rem',
                px: 1.25,
                py: 0.4,
                textTransform: 'none',
                minWidth: 42,
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
      <Box sx={{ flexGrow: 1, p: 2, display: 'flex', flexDirection: 'column', position: 'relative' }}>
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
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
            {/* Interactive OHLC HUD Bar */}
            <Box
              sx={{
                mb: 1.5,
                px: 2,
                py: 1,
                borderRadius: 1.5,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(67, 89, 113, 0.04)',
                border: (t) => `1px solid ${t.palette.divider}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              {displayOhlc ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, flexWrap: 'wrap' }}>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'text.secondary' }}>
                    {displayOhlc.timeStr || interval.toUpperCase()}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>O</Typography>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: displayOhlc.color }}>
                      ${displayOhlc.open?.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>H</Typography>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: displayOhlc.color }}>
                      ${displayOhlc.high?.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>L</Typography>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: displayOhlc.color }}>
                      ${displayOhlc.low?.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>C</Typography>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: displayOhlc.color }}>
                      ${displayOhlc.close?.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>Vol</Typography>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'text.primary' }}>
                      {formatVol(displayOhlc.volume)}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                  Arahkan kursor ke lilin untuk melihat metrik OHLCV
                </Typography>
              )}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.68rem', fontWeight: 500 }}>
                  {klineData?.candles?.length || 0} lilin
                </Typography>
              </Box>
            </Box>

            {/* TradingView Canvas Container */}
            <Box
              ref={chartContainerRef}
              id="kline-chart-container"
              sx={{
                flex: 1,
                width: '100%',
                minHeight: 460,
                borderRadius: 2,
                overflow: 'hidden',
                backgroundColor: isDark ? '#1E1E2D' : '#FAFAFC',
                border: (t) => `1px solid ${t.palette.divider}`,
                boxShadow: isDark ? 'inset 0 0 16px rgba(0,0,0,0.3)' : 'none',
              }}
            />

            {/* Bottom Status & Info Bar */}
            <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.68rem' }}>
                Sumber: Moomoo OpenAPI (K-line Semasa · Kuota Sejarah Sifar)
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.68rem' }}>
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
