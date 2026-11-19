import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  TextField,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Divider,
  InputAdornment,
  Card,
  CardContent,
  Tabs,
  Tab,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import SaveIcon from '@mui/icons-material/Save';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import StorageIcon from '@mui/icons-material/Storage';
import SecurityIcon from '@mui/icons-material/Security';
import HistoryIcon from '@mui/icons-material/History';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import BarChartIcon from '@mui/icons-material/BarChart';
import SpeedIcon from '@mui/icons-material/Speed';
import LayersIcon from '@mui/icons-material/Layers';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { sneatTokens } from '../theme';
import { OpendControlPanel } from '../components/OpendControlPanel';

const DEFAULT_CONFIG = {
  min_price: 10.0,
  min_market_cap: 1000000000.0,
  min_volume: 1000000.0,
  min_rvol: 0.50,
  max_rvol: 20.00,
  max_candidates_per_lane: 5,
  max_buying_power: 100000.0,
};

export function SettingsPage({ statusData, onRefresh, initialTab }) {
  const getInitialTab = () => {
    if (typeof initialTab === 'number') return initialTab;
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      if (hash.includes('tab=opend') || hash.includes('opend')) return 1;
    }
    return 0;
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  useEffect(() => {
    const checkHashTab = () => {
      if (typeof window !== 'undefined') {
        const hash = window.location.hash || '';
        if (hash.includes('tab=opend') || hash.includes('opend')) {
          setActiveTab(1);
        } else if (hash.includes('settings') && !hash.includes('tab=opend')) {
          setActiveTab(0);
        }
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', checkHashTab);
      return () => window.removeEventListener('hashchange', checkHashTab);
    }
  }, []);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    if (typeof window !== 'undefined') {
      window.location.hash = newValue === 1 ? '#/settings?tab=opend' : '#/settings';
    }
  };

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [originalConfig, setOriginalConfig] = useState(DEFAULT_CONFIG);
  const [limits, setLimits] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [updatedBy, setUpdatedBy] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Field validation errors
  const [errors, setErrors] = useState({});

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const [cfgRes, auditRes] = await Promise.all([
        fetch('/api/screener/config'),
        fetch('/api/screener/config/audit'),
      ]);

      if (cfgRes.ok) {
        const data = await cfgRes.json();
        if (data.config) {
          setConfig(data.config);
          setOriginalConfig(data.config);
          setLimits(data.limits);
          setUpdatedAt(data.updated_at);
          setUpdatedBy(data.updated_by);
        }
      } else {
        const errData = await cfgRes.json().catch(() => ({}));
        setErrorMsg(errData.error || 'Gagal memuatkan konfigurasi screener.');
      }

      if (auditRes.ok) {
        const aData = await auditRes.json();
        setAuditLogs(aData.audit || []);
      }
    } catch (err) {
      console.error('[SettingsPage] Error fetching config:', err);
      setErrorMsg('Ralat rangkaian semasa memuatkan tetapan screener.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const validateField = (field, value) => {
    if (value === '' || value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
      return 'Nilai tidak boleh kosong.';
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return 'Nilai mestilah nombor yang sah';
    }

    if (field === 'min_price') {
      if (num < 1.0) {
        return 'Harga minimum tidak boleh kurang daripada $1.00 (Had Keselamatan).';
      }
      if (num > 10000.0) {
        return 'Harga minimum tidak boleh melebihi $10,000.00.';
      }
    }

    if (field === 'min_market_cap') {
      if (num < 10000000.0) {
        return 'Market Cap minimum tidak boleh kurang daripada $10,000,000 ($10M).';
      }
      if (num > 10000000000000.0) {
        return 'Market Cap minimum tidak boleh melebihi $10,000,000,000,000 ($10T).';
      }
    }

    if (field === 'min_volume') {
      if (num < 50000.0) {
        return 'Volum ADV20 minimum tidak boleh kurang daripada 50,000 saham.';
      }
      if (num > 1000000000.0) {
        return 'Volum ADV20 minimum tidak boleh melebihi 1,000,000,000 saham.';
      }
    }

    if (field === 'min_rvol') {
      if (num < 0.0 || num > 50.0) {
        return 'RVOL minimum mestilah antara 0.0 dan 50.0.';
      }
    }

    if (field === 'max_rvol') {
      if (num < 0.1 || num > 100.0) {
        return 'RVOL maksimum mestilah antara 0.1 dan 100.0.';
      }
    }

    if (field === 'max_candidates_per_lane') {
      if (!Number.isInteger(num)) {
        return 'Had calon per lorong mestilah nombor bulat (integer).';
      }
      if (num < 1 || num > 20) {
        return 'Had calon per lorong mestilah antara 1 dan 20 kaunter (Had Kuota Moomoo OpenAPI).';
      }
    }

    if (field === 'max_buying_power') {
      if (num < 500.0) {
        return 'Had buying power maksimum tidak boleh kurang daripada $500.00.';
      }
      if (num > 100000000.0) {
        return 'Had buying power maksimum tidak boleh melebihi $100,000,000.00 ($100M).';
      }
    }

    return null;
  };

  const handleFieldChange = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    const err = validateField(field, value);
    setErrors((prev) => ({ ...prev, [field]: err }));
    setSuccessMsg('');
  };

  const handlePresetPrice = (priceVal) => {
    handleFieldChange('min_price', priceVal);
  };

  const handlePresetCap = (capVal) => {
    handleFieldChange('min_market_cap', capVal);
  };

  const handlePresetVol = (volVal) => {
    handleFieldChange('min_volume', volVal);
  };

  const handlePresetRvol = (minR, maxR) => {
    setConfig((prev) => ({ ...prev, min_rvol: minR, max_rvol: maxR }));
    setErrors((prev) => ({
      ...prev,
      min_rvol: validateField('min_rvol', minR),
      max_rvol: validateField('max_rvol', maxR),
      rvol_cross: minR > maxR ? 'RVOL minimum tidak boleh melebihi RVOL maksimum' : null,
    }));
  };

  const handlePresetLane = (val) => {
    handleFieldChange('max_candidates_per_lane', val);
  };

  const handlePresetBuyingPower = (val) => {
    handleFieldChange('max_buying_power', val);
  };

  const handleResetDefaults = () => {
    setConfig(DEFAULT_CONFIG);
    setErrors({});
    setSuccessMsg('Tetapan telah diset semula kepada nilai cadangan lalai. Tekan Simpan untuk menguatkuasakan.');
    setErrorMsg('');
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSuccessMsg('');
    setErrorMsg('');

    // Pre-validation
    const newErrors = {};
    Object.keys(config).forEach((k) => {
      const err = validateField(k, config[k]);
      if (err) newErrors[k] = err;
    });

    if (Number(config.min_rvol) > Number(config.max_rvol)) {
      newErrors.rvol_cross = 'RVOL minimum tidak boleh melebihi RVOL maksimum.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setErrorMsg(newErrors.min_price || newErrors.max_candidates_per_lane || newErrors.max_buying_power || newErrors.rvol_cross || 'Sila betulkan nilai yang tidak sah sebelum menyimpan.');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch('/api/screener/config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          min_price: Number(config.min_price),
          min_market_cap: Number(config.min_market_cap),
          min_volume: Number(config.min_volume),
          min_rvol: Number(config.min_rvol),
          max_rvol: Number(config.max_rvol),
          max_candidates_per_lane: Number(config.max_candidates_per_lane),
          max_buying_power: Number(config.max_buying_power),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setConfig(data.config);
        setOriginalConfig(data.config);
        setUpdatedAt(data.updated_at);
        setUpdatedBy(data.updated_by);
        setSuccessMsg('Tetapan screener berjaya dikemas kini! Kitaran seterusnya akan menggunakan parameter ini secara dinamik.');
        setErrors({});

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('screener-config-updated', { detail: data.config }));
        }

        // Refresh audit log
        const auditRes = await fetch('/api/screener/config/audit');
        if (auditRes.ok) {
          const aData = await auditRes.json();
          setAuditLogs(aData.audit || []);
        }
      } else {
        setErrorMsg(data.error || 'Gagal mengemas kini konfigurasi screener.');
      }
    } catch (err) {
      console.error('[SettingsPage] Error saving config:', err);
      setErrorMsg('Ralat komunikasi pelayan semasa menyimpan tetapan.');
    } finally {
      setSaving(false);
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return 'N/A';
    try {
      return new Date(ts).toLocaleString('ms-MY', {
        timeZone: 'Asia/Kuala_Lumpur',
        dateStyle: 'medium',
        timeStyle: 'medium',
      });
    } catch (e) {
      return ts;
    }
  };

  const formatCurrency = (val) => {
    if (!Number.isFinite(Number(val))) return 'N/A';
    const num = Number(val);
    if (num >= 1000000000000) return `$${(num / 1000000000000).toFixed(2)}T`;
    if (num >= 1000000000) return `$${(num / 1000000000).toFixed(2)}B`;
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    return `$${num.toLocaleString()}`;
  };

  return (
    <Box id="page-settings" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
        <Box>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              fontSize: { xs: '1.2rem', sm: '1.4rem' },
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
            }}
          >
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
              <TuneIcon sx={{ fontSize: 22 }} />
            </Box>
            Tetapan Sistem &amp; Pengurusan Gerbang
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
            Konfigurasi parameter screener L0, had siling buying power, dan kawalan sesi gerbang OpenD Moomoo.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            icon={<SecurityIcon sx={{ fontSize: '14px !important' }} />}
            label="Had Sempadan: >= $1.00"
            sx={{
              fontWeight: 700,
              backgroundColor: sneatTokens.primary.soft,
              color: sneatTokens.primary.main,
              borderRadius: 1.5,
            }}
          />
          <Chip
            size="small"
            icon={<AccountBalanceWalletIcon sx={{ fontSize: '14px !important' }} />}
            label="Had Siling Modal: Aktif"
            sx={{
              fontWeight: 700,
              backgroundColor: sneatTokens.success.soft,
              color: sneatTokens.success.main,
              borderRadius: 1.5,
            }}
          />
        </Box>
      </Box>

      {/* Navigation Tabs between Screener Config and OpenD Gateway */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          aria-label="Settings and OpenD Gateway tabs"
          textColor="primary"
          indicatorColor="primary"
          sx={{
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 700,
              fontSize: '0.9rem',
              minHeight: 48,
            },
          }}
        >
          <Tab
            id="tab-screener-config"
            icon={<TuneIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Parameter Screener & Modal (L0 / Risk)"
          />
          <Tab
            id="tab-opend-gateway"
            icon={<SettingsIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Pengurusan Gerbang OpenD"
          />
        </Tabs>
      </Box>

      {activeTab === 1 ? (
        <Box id="tab-panel-opend" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
          <OpendControlPanel statusData={statusData} onRefresh={onRefresh} />
        </Box>
      ) : (
        <>
      {/* Alert Notifications */}
      {successMsg && (
        <Alert
          id="configAlertSuccess"
          severity="success"
          icon={<CheckCircleOutlineIcon fontSize="inherit" />}
          onClose={() => setSuccessMsg('')}
          sx={{
            borderRadius: 2,
            border: '1px solid',
            borderColor: sneatTokens.success.main,
            fontWeight: 500,
          }}
        >
          {successMsg}
        </Alert>
      )}

      {errorMsg && (
        <Alert
          id="configAlertError"
          severity="error"
          onClose={() => setErrorMsg('')}
          sx={{
            borderRadius: 2,
            border: '1px solid',
            borderColor: sneatTokens.error.main,
            fontWeight: 500,
          }}
        >
          {errorMsg}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={36} />
        </Box>
      ) : (
        <Grid container spacing={2.5}>
          {/* Main Form Column (Left - 7.5 col) */}
          <Grid item xs={12} md={7} lg={7.5}>
            <Box component="form" onSubmit={handleSave} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* 1. Min Price Section Card */}
              <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2, gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: 1 }}>
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
                          flexShrink: 0,
                        }}
                      >
                        <AttachMoneyIcon sx={{ fontSize: 22 }} />
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: { xs: '0.875rem', sm: '0.95rem' }, lineHeight: 1.3 }}>
                          1. Harga Minimum Saham (Min Price)
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, fontSize: { xs: '0.72rem', sm: '0.75rem' } }}>
                          Had keselamatan tegar mandatori &gt;= $1.00 (saham penny disekat)
                        </Typography>
                      </Box>
                    </Box>
                    <Chip
                      size="small"
                      label={`Semasa: $${Number(config.min_price || 0).toFixed(2)}`}
                      sx={{ fontWeight: 600, backgroundColor: 'action.hover', borderRadius: 1.5, flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }}
                    />
                  </Box>

                  <TextField
                    id="inputMinPrice"
                    fullWidth
                    size="small"
                    type="number"
                    value={config.min_price}
                    onChange={(e) => handleFieldChange('min_price', e.target.value)}
                    error={Boolean(errors.min_price)}
                    helperText={errors.min_price || 'Had keselamatan tegar: Mandatori >= $1.00. Input < $1.00 ditolak serta-merta.'}
                    InputProps={{
                      startAdornment: <InputAdornment position="start" sx={{ color: 'text.secondary', fontWeight: 600 }}>$</InputAdornment>,
                      inputProps: { min: 1.0, max: 10000.0, step: 0.5 },
                    }}
                  />

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.5 }}>
                      Pilihan Pantas:
                    </Typography>
                    {[1.0, 3.0, 5.0, 10.0].map((p) => (
                      <Chip
                        key={p}
                        id={`chipPrice${p}`}
                        label={`$${p.toFixed(2)}`}
                        size="small"
                        clickable
                        color={Number(config.min_price) === p ? 'primary' : 'default'}
                        variant={Number(config.min_price) === p ? 'filled' : 'outlined'}
                        onClick={() => handlePresetPrice(p)}
                        sx={{ fontSize: '0.75rem', fontWeight: 600, borderRadius: 1.5 }}
                      />
                    ))}
                  </Box>
                </CardContent>
              </Card>

              {/* 2. Min Market Cap Section Card */}
              <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2, gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: 1 }}>
                      <Box
                        sx={{
                          width: 38,
                          height: 38,
                          borderRadius: '8px',
                          backgroundColor: sneatTokens.info.soft,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: sneatTokens.info.main,
                          flexShrink: 0,
                        }}
                      >
                        <AccountBalanceIcon sx={{ fontSize: 22 }} />
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: { xs: '0.875rem', sm: '0.95rem' }, lineHeight: 1.3 }}>
                          2. Modal Pasaran Minimum (Min Market Cap)
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, fontSize: { xs: '0.72rem', sm: '0.75rem' } }}>
                          Menapis syarikat mengikut saiz permodalan pasaran institusi
                        </Typography>
                      </Box>
                    </Box>
                    <Chip
                      size="small"
                      label={`Format: ${formatCurrency(config.min_market_cap)}`}
                      sx={{ fontWeight: 600, backgroundColor: 'action.hover', borderRadius: 1.5, flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }}
                    />
                  </Box>

                  <TextField
                    id="inputMinMarketCap"
                    fullWidth
                    size="small"
                    type="number"
                    value={config.min_market_cap}
                    onChange={(e) => handleFieldChange('min_market_cap', e.target.value)}
                    error={Boolean(errors.min_market_cap)}
                    helperText={errors.min_market_cap || `Nilai Semasa: ${formatCurrency(config.min_market_cap)}. Julat sah: $10M hingga $10T.`}
                    InputProps={{
                      startAdornment: <InputAdornment position="start" sx={{ color: 'text.secondary', fontWeight: 600 }}>$</InputAdornment>,
                      inputProps: { min: 10000000.0, max: 10000000000000.0, step: 100000000 },
                    }}
                  />

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.5 }}>
                      Pilihan Pantas:
                    </Typography>
                    {[
                      { label: '$100M', val: 100000000.0 },
                      { label: '$500M', val: 500000000.0 },
                      { label: '$1B', val: 1000000000.0 },
                      { label: '$2B', val: 2000000000.0 },
                    ].map((c) => (
                      <Chip
                        key={c.val}
                        id={`chipCap${c.label.replace('$', '')}`}
                        label={c.label}
                        size="small"
                        clickable
                        color={Number(config.min_market_cap) === c.val ? 'primary' : 'default'}
                        variant={Number(config.min_market_cap) === c.val ? 'filled' : 'outlined'}
                        onClick={() => handlePresetCap(c.val)}
                        sx={{ fontSize: '0.75rem', fontWeight: 600, borderRadius: 1.5 }}
                      />
                    ))}
                  </Box>
                </CardContent>
              </Card>

              {/* 3. Min Volume ADV20 Section Card */}
              <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2, gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: 1 }}>
                      <Box
                        sx={{
                          width: 38,
                          height: 38,
                          borderRadius: '8px',
                          backgroundColor: sneatTokens.warning.soft,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: sneatTokens.warning.main,
                          flexShrink: 0,
                        }}
                      >
                        <BarChartIcon sx={{ fontSize: 22 }} />
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: { xs: '0.875rem', sm: '0.95rem' }, lineHeight: 1.3 }}>
                          3. Purata Volum Harian 20-Hari (ADV20)
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, fontSize: { xs: '0.72rem', sm: '0.75rem' } }}>
                          Kecairan pasaran mencukupi untuk elak slippage pelaksanaan
                        </Typography>
                      </Box>
                    </Box>
                    <Chip
                      size="small"
                      label={`Semasa: ${Number(config.min_volume || 0).toLocaleString()} unit`}
                      sx={{ fontWeight: 600, backgroundColor: 'action.hover', borderRadius: 1.5, flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }}
                    />
                  </Box>

                  <TextField
                    id="inputMinVolume"
                    fullWidth
                    size="small"
                    type="number"
                    value={config.min_volume}
                    onChange={(e) => handleFieldChange('min_volume', e.target.value)}
                    error={Boolean(errors.min_volume)}
                    helperText={errors.min_volume || `Nilai Semasa: ${Number(config.min_volume || 0).toLocaleString()} saham. Julat sah: 50,000 hingga 1B.`}
                    InputProps={{
                      endAdornment: <InputAdornment position="end" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>saham</InputAdornment>,
                      inputProps: { min: 50000.0, max: 1000000000.0, step: 50000 },
                    }}
                  />

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.5 }}>
                      Pilihan Pantas:
                    </Typography>
                    {[
                      { label: '50k', val: 50000.0 },
                      { label: '250k', val: 250000.0 },
                      { label: '500k', val: 500000.0 },
                      { label: '1M', val: 1000000.0 },
                    ].map((v) => (
                      <Chip
                        key={v.val}
                        id={`chipVol${v.label}`}
                        label={v.label}
                        size="small"
                        clickable
                        color={Number(config.min_volume) === v.val ? 'primary' : 'default'}
                        variant={Number(config.min_volume) === v.val ? 'filled' : 'outlined'}
                        onClick={() => handlePresetVol(v.val)}
                        sx={{ fontSize: '0.75rem', fontWeight: 600, borderRadius: 1.5 }}
                      />
                    ))}
                  </Box>
                </CardContent>
              </Card>

              {/* 4. Relative Volume Range (RVOL) Section Card */}
              <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2, gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, flex: 1 }}>
                      <Box
                        sx={{
                          width: 38,
                          height: 38,
                          borderRadius: '8px',
                          backgroundColor: sneatTokens.secondary.soft,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: sneatTokens.secondary.main,
                          flexShrink: 0,
                        }}
                      >
                        <SpeedIcon sx={{ fontSize: 22 }} />
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: { xs: '0.875rem', sm: '0.95rem' }, lineHeight: 1.3 }}>
                          4. Julat Nisbah Volum Relatif (Relative Volume / RVOL)
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, fontSize: { xs: '0.72rem', sm: '0.75rem' } }}>
                          Nisbah volum aktif berbanding purata historikal saham
                        </Typography>
                      </Box>
                    </Box>
                    <Chip
                      size="small"
                      label={`Julat: ${config.min_rvol}x - ${config.max_rvol}x`}
                      sx={{ fontWeight: 600, backgroundColor: 'action.hover', borderRadius: 1.5, flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }}
                    />
                  </Box>

                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        id="inputMinRvol"
                        fullWidth
                        size="small"
                        label="Min RVOL"
                        type="number"
                        value={config.min_rvol}
                        onChange={(e) => handleFieldChange('min_rvol', e.target.value)}
                        error={Boolean(errors.min_rvol || errors.rvol_cross)}
                        helperText={errors.min_rvol || errors.rvol_cross || 'Had minimum RVOL (>= 0.0)'}
                        InputProps={{
                          endAdornment: <InputAdornment position="end" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>x</InputAdornment>,
                          inputProps: { min: 0.0, max: 50.0, step: 0.1 },
                        }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        id="inputMaxRvol"
                        fullWidth
                        size="small"
                        label="Max RVOL"
                        type="number"
                        value={config.max_rvol}
                        onChange={(e) => handleFieldChange('max_rvol', e.target.value)}
                        error={Boolean(errors.max_rvol || errors.rvol_cross)}
                        helperText={errors.max_rvol || 'Had maksimum RVOL (<= 100.0)'}
                        InputProps={{
                          endAdornment: <InputAdornment position="end" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>x</InputAdornment>,
                          inputProps: { min: 0.1, max: 100.0, step: 0.5 },
                        }}
                      />
                    </Grid>
                  </Grid>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.5 }}>
                      Preset Mod:
                    </Typography>
                    {[
                      { label: 'Konservatif (1.30 - 20.0)', min: 1.30, max: 20.0 },
                      { label: 'Sederhana (0.80 - 15.0)', min: 0.80, max: 15.0 },
                      { label: 'Agresif (0.50 - 30.0)', min: 0.50, max: 30.0 },
                    ].map((m) => (
                      <Chip
                        key={m.label}
                        label={m.label}
                        size="small"
                        clickable
                        variant="outlined"
                        onClick={() => handlePresetRvol(m.min, m.max)}
                        sx={{ fontSize: '0.75rem', fontWeight: 600, borderRadius: 1.5 }}
                      />
                    ))}
                  </Box>
                </CardContent>
              </Card>

              {/* Field 5: Max Candidates Per Lane (MAX_CANDIDATES_PER_LANE) */}
              <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 2 }}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: '8px',
                          backgroundColor: sneatTokens.primary.soft,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: sneatTokens.primary.main,
                          flexShrink: 0,
                        }}
                      >
                        <LayersIcon sx={{ fontSize: 24 }} />
                      </Box>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary' }}>
                          Had Calon Per Lorong L0 (MAX_CANDIDATES_PER_LANE)
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          Had siling calon Stage 3 K-line enrichment bagi lorong MOMENTUM &amp; SETUP
                        </Typography>
                      </Box>
                    </Box>
                    <Chip
                      size="small"
                      label={`Semasa: ${config.max_candidates_per_lane ?? 5} kaunter/lorong`}
                      sx={{ fontWeight: 600, backgroundColor: 'action.hover', borderRadius: 1.5, flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }}
                    />
                  </Box>

                  <TextField
                    id="inputMaxCandidatesPerLane"
                    name="max_candidates_per_lane"
                    fullWidth
                    size="small"
                    type="number"
                    value={config.max_candidates_per_lane ?? 5}
                    onChange={(e) => handleFieldChange('max_candidates_per_lane', e.target.value)}
                    error={Boolean(errors.max_candidates_per_lane)}
                    helperText={errors.max_candidates_per_lane || 'Perlindungan kuota Moomoo OpenAPI (100 simbol / 30 hari rolling). Dual-lane: 2 x had = maks calon per imbasan. Julat sah: 1 hingga 20 kaunter.'}
                    InputProps={{
                      endAdornment: <InputAdornment position="end" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>kaunter / lorong</InputAdornment>,
                      inputProps: { min: 1, max: 20, step: 1 },
                    }}
                  />

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.5 }}>
                      Preset Lorong:
                    </Typography>
                    {[
                      { label: 'Konservatif (3 kaunter / 6 maks)', val: 3 },
                      { label: 'Lalai (5 kaunter / 10 maks)', val: 5 },
                      { label: 'Agresif (10 kaunter / 20 maks)', val: 10 },
                    ].map((p) => (
                      <Chip
                        key={p.label}
                        label={p.label}
                        size="small"
                        clickable
                        variant="outlined"
                        onClick={() => handlePresetLane(p.val)}
                        sx={{ fontSize: '0.75rem', fontWeight: 600, borderRadius: 1.5 }}
                      />
                    ))}
                  </Box>
                </CardContent>
              </Card>

              {/* Field 6: Max Buying Power (Limit Buying Power) (HOM-302) */}
              <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 2 }}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: '8px',
                          backgroundColor: sneatTokens.success.soft,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: sneatTokens.success.main,
                          flexShrink: 0,
                        }}
                      >
                        <AccountBalanceWalletIcon sx={{ fontSize: 24 }} />
                      </Box>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary' }}>
                          6. Had Siling Modal Maksimum (Limit Buying Power)
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          Had siling modal efektif bagi pengiraan saiz posisi Haziq (L2) dan pengauditan had risiko Danial (L3)
                        </Typography>
                      </Box>
                    </Box>
                    <Chip
                      size="small"
                      label={`Semasa: ${formatCurrency(config.max_buying_power ?? 100000)}`}
                      sx={{ fontWeight: 600, backgroundColor: 'action.hover', borderRadius: 1.5, flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }}
                    />
                  </Box>

                  <TextField
                    id="inputMaxBuyingPower"
                    name="max_buying_power"
                    fullWidth
                    size="small"
                    type="number"
                    value={config.max_buying_power ?? 100000}
                    onChange={(e) => handleFieldChange('max_buying_power', e.target.value)}
                    error={Boolean(errors.max_buying_power)}
                    helperText={errors.max_buying_power || 'Had keselamatan minima $500.00. Walaupun baki akaun broker bernilai jutaan dolar, sistem ejen hanya akan menggunakan had siling ini sebagai asas modal efektif.'}
                    InputProps={{
                      startAdornment: <InputAdornment position="start" sx={{ color: 'text.secondary', fontWeight: 600 }}>$</InputAdornment>,
                      endAdornment: <InputAdornment position="end" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>USD</InputAdornment>,
                      inputProps: { min: 500.0, max: 100000000.0, step: 1000.0 },
                    }}
                  />

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.5 }}>
                      Preset Siling Modal:
                    </Typography>
                    {[
                      { label: '$10,000 (Ujian Kecil)', val: 10000 },
                      { label: '$25,000 (PDT Minima)', val: 25000 },
                      { label: '$50,000 (Konservatif)', val: 50000 },
                      { label: '$100,000 (Lalai)', val: 100000 },
                      { label: '$500,000 (Institusi)', val: 500000 },
                    ].map((p) => (
                      <Chip
                        key={p.label}
                        label={p.label}
                        size="small"
                        clickable
                        variant="outlined"
                        onClick={() => handlePresetBuyingPower(p.val)}
                        sx={{ fontSize: '0.75rem', fontWeight: 600, borderRadius: 1.5 }}
                      />
                    ))}
                  </Box>
                </CardContent>
              </Card>

              {/* Form Action Controls Card */}
              <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, backgroundColor: 'background.paper' }}>
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
                    <Button
                      id="btnSaveConfig"
                      type="submit"
                      variant="contained"
                      color="primary"
                      disabled={saving}
                      startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                      sx={{
                        flex: { xs: '1 1 100%', sm: 'none' },
                        px: 3.5,
                        py: 1.1,
                        fontWeight: 700,
                        borderRadius: 2,
                        boxShadow: '0 4px 12px 0 rgba(105, 108, 255, 0.4)',
                        '&:hover': {
                          boxShadow: '0 6px 16px 0 rgba(105, 108, 255, 0.5)',
                        },
                      }}
                    >
                      {saving ? 'Menyimpan...' : 'Simpan Tetapan'}
                    </Button>
                    <Button
                      id="btnResetDefaults"
                      type="button"
                      variant="outlined"
                      color="secondary"
                      disabled={saving}
                      startIcon={<RestartAltIcon />}
                      onClick={handleResetDefaults}
                      sx={{
                        flex: { xs: '1 1 100%', sm: 'none' },
                        px: 2.5,
                        py: 1.1,
                        fontWeight: 600,
                        borderRadius: 2,
                      }}
                    >
                      Set Semula Lalai
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          </Grid>

          {/* Sidebar / Info Column (Right - 4.5 col) */}
          <Grid item xs={12} md={5} lg={4.5}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Status Summary Card */}
              <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
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
                      }}
                    >
                      <InfoOutlinedIcon sx={{ fontSize: 22 }} />
                    </Box>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        Status Konfigurasi Semasa
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        Parameter screener yang sedang beroperasi di L0
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        p: 1.25,
                        borderRadius: 1.5,
                        backgroundColor: 'action.hover',
                      }}
                    >
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                        Harga Min:
                      </Typography>
                      <Typography id="displayMinPrice" variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        ${Number(originalConfig.min_price).toFixed(2)}
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        p: 1.25,
                        borderRadius: 1.5,
                        backgroundColor: 'action.hover',
                      }}
                    >
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                        Market Cap Min:
                      </Typography>
                      <Typography id="displayMinMarketCap" variant="body2" sx={{ fontWeight: 700 }}>
                        {formatCurrency(originalConfig.min_market_cap)}
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        p: 1.25,
                        borderRadius: 1.5,
                        backgroundColor: 'action.hover',
                      }}
                    >
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                        ADV20 Min:
                      </Typography>
                      <Typography id="displayMinVolume" variant="body2" sx={{ fontWeight: 700 }}>
                        {Number(originalConfig.min_volume).toLocaleString()} unit
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        p: 1.25,
                        borderRadius: 1.5,
                        backgroundColor: 'action.hover',
                      }}
                    >
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                        Julat RVOL:
                      </Typography>
                      <Typography id="displayRvolRange" variant="body2" sx={{ fontWeight: 700 }}>
                        {originalConfig.min_rvol} - {originalConfig.max_rvol}
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        p: 1.25,
                        borderRadius: 1.5,
                        backgroundColor: 'action.hover',
                      }}
                    >
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                        Calon Per Lorong:
                      </Typography>
                      <Typography id="displayMaxCandidatesPerLane" variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {originalConfig.max_candidates_per_lane ?? 5} kaunter
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        p: 1.25,
                        borderRadius: 1.5,
                        backgroundColor: 'action.hover',
                      }}
                    >
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                        Had Siling Modal:
                      </Typography>
                      <Typography id="displayMaxBuyingPower" variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>
                        {formatCurrency(originalConfig.max_buying_power ?? 100000)}
                      </Typography>
                    </Box>

                    <Divider sx={{ my: 0.5 }} />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 0.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Kemas Kini Terakhir:</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {formatTimestamp(updatedAt)}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 0.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>Dikemas kini Oleh:</Typography>
                      <Chip
                        size="small"
                        label={updatedBy || 'system'}
                        sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600, backgroundColor: sneatTokens.primary.soft, color: sneatTokens.primary.main, borderRadius: 1 }}
                      />
                    </Box>
                  </Box>
                </CardContent>
              </Card>

              {/* Moomoo Quota Safety Notice */}
              <Card
                sx={{
                  border: '1px solid',
                  borderColor: sneatTokens.primary.main,
                  borderRadius: 2.5,
                  backgroundColor: sneatTokens.primary.soft,
                }}
              >
                <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                    <InfoOutlinedIcon sx={{ color: sneatTokens.primary.main, fontSize: 22 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: sneatTokens.primary.main }}>
                      Kuota K-line Moomoo OpenAPI (100 / 30 Hari)
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontSize: '0.825rem', color: 'text.primary', lineHeight: 1.6 }}>
                    Broker Moomoo mengehadkan K-line sejarah kepada <strong>100 simbol unik / 30 hari rolling</strong>. Had siling maksimum 20 kaunter per lorong (40 calon dwilorong) memastikan bajet kuota harian (~4-5 simbol baharu) terlindung daripada keletihan mendadak.
                  </Typography>
                </CardContent>
              </Card>

              {/* Hard Bounds Notice */}
              <Card
                sx={{
                  border: '1px solid',
                  borderColor: sneatTokens.warning.main,
                  borderRadius: 2.5,
                  backgroundColor: sneatTokens.warning.soft,
                }}
              >
                <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                    <SecurityIcon sx={{ color: sneatTokens.warning.main, fontSize: 22 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: sneatTokens.warning.main }}>
                      Had Keselamatan Mandatori ($1.00)
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontSize: '0.825rem', color: 'text.primary', lineHeight: 1.6 }}>
                    Berdasarkan piawaian perlindungan modal institutional, harga minimum saringan disekat daripada sebarang nilai di bawah <strong>$1.00</strong>. Sebarang cubaan menetapkan harga &lt; $1.00 akan disekat serta-merta oleh backend validation.
                  </Typography>
                </CardContent>
              </Card>

              {/* Audit History Card */}
              <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                    <Box
                      sx={{
                        width: 38,
                        height: 38,
                        borderRadius: '8px',
                        backgroundColor: sneatTokens.secondary.soft,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: sneatTokens.secondary.main,
                      }}
                    >
                      <HistoryIcon sx={{ fontSize: 22 }} />
                    </Box>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                        Log Audit Perubahan
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        Sejarah modifikasi konfigurasi SQLite WAL
                      </Typography>
                    </Box>
                  </Box>

                  {auditLogs.length === 0 ? (
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                      Tiada sejarah perubahan direkodkan setakat ini.
                    </Typography>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, maxHeight: 280, overflowY: 'auto' }}>
                      {auditLogs.slice(0, 8).map((log) => {
                        let parsedNew = {};
                        try {
                          parsedNew = JSON.parse(log.new_values);
                        } catch (e) {}
                        return (
                          <Box
                            key={log.id}
                            sx={{
                              p: 1.25,
                              borderRadius: 1.5,
                              backgroundColor: 'action.hover',
                              fontSize: '0.75rem',
                              borderLeft: '3px solid',
                              borderColor: sneatTokens.primary.main,
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                              <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>
                                {log.user}
                              </Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                                {formatTimestamp(log.timestamp)}
                              </Typography>
                            </Box>
                            <Typography variant="caption" sx={{ color: 'text.primary', display: 'block', lineHeight: 1.4 }}>
                              Harga: ${parsedNew.min_price} | Cap: {formatCurrency(parsedNew.min_market_cap)} | Vol: {Number(parsedNew.min_volume || 0).toLocaleString()} | RVOL: {parsedNew.min_rvol}-{parsedNew.max_rvol} | Lorong: {parsedNew.max_candidates_per_lane || 5}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Box>
          </Grid>
        </Grid>
      )}
      </>
      )}
    </Box>
  );
}
