import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Divider,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Card,
  CardContent,
  Stack,
  Tooltip,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import SaveIcon from '@mui/icons-material/Save';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import StorageIcon from '@mui/icons-material/Storage';
import SecurityIcon from '@mui/icons-material/Security';
import HistoryIcon from '@mui/icons-material/History';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { sneatTokens } from '../theme';

const DEFAULT_CONFIG = {
  min_price: 10.0,
  min_market_cap: 1000000000.0,
  min_volume: 1000000.0,
  min_rvol: 0.50,
  max_rvol: 20.00,
};

export function SettingsPage() {
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
      setErrorMsg(newErrors.min_price || newErrors.rvol_cross || 'Sila betulkan nilai yang tidak sah sebelum menyimpan.');
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
              gap: 1,
            }}
          >
            <SettingsIcon sx={{ color: sneatTokens.primary.main }} />
            Tetapan Parameter Screener L0
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
            Pelarasan dinamik bagi penapis harga, market cap, volum ADV20, dan julat RVOL dengan had keselamatan mandatori ($1.00).
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            icon={<StorageIcon sx={{ fontSize: '14px !important' }} />}
            label="SQLite WAL: Aktif"
            sx={{
              fontWeight: 700,
              backgroundColor: sneatTokens.success.soft,
              color: sneatTokens.success.main,
            }}
          />
          <Chip
            size="small"
            icon={<SecurityIcon sx={{ fontSize: '14px !important' }} />}
            label="Had Sempadan: >= $1.00"
            sx={{
              fontWeight: 700,
              backgroundColor: sneatTokens.primary.soft,
              color: sneatTokens.primary.main,
            }}
          />
        </Box>
      </Box>

      {/* Alert Notifications */}
      {successMsg && (
        <Alert
          id="configAlertSuccess"
          severity="success"
          icon={<CheckCircleOutlineIcon fontSize="inherit" />}
          onClose={() => setSuccessMsg('')}
          sx={{ borderRadius: 2 }}
        >
          {successMsg}
        </Alert>
      )}

      {errorMsg && (
        <Alert
          id="configAlertError"
          severity="error"
          onClose={() => setErrorMsg('')}
          sx={{ borderRadius: 2 }}
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
          {/* Main Form Column */}
          <Grid size={{ xs: 12, md: 7, lg: 8 }}>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 2, sm: 3 },
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
                  Konfigurasi Parameter Pasaran US
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Per-cycle hot read (sifar restart kontena)
                </Typography>
              </Box>

              <Box component="form" onSubmit={handleSave} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {/* 1. Min Price */}
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    1. Harga Minimum Saham (Min Price)
                  </Typography>
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
                      startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      inputProps: { min: 1.0, max: 10000.0, step: 0.5 },
                    }}
                  />
                  <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', alignSelf: 'center', mr: 0.5 }}>
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
                        sx={{ fontSize: '0.75rem', fontWeight: 600 }}
                      />
                    ))}
                  </Stack>
                </Box>

                <Divider />

                {/* 2. Min Market Cap */}
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    2. Modal Pasaran Minimum (Min Market Cap)
                  </Typography>
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
                      startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      inputProps: { min: 10000000.0, max: 10000000000000.0, step: 100000000 },
                    }}
                  />
                  <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', alignSelf: 'center', mr: 0.5 }}>
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
                        sx={{ fontSize: '0.75rem', fontWeight: 600 }}
                      />
                    ))}
                  </Stack>
                </Box>

                <Divider />

                {/* 3. Min Volume ADV20 */}
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    3. Purata Volum Harian 20-Hari (ADV20)
                  </Typography>
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
                      inputProps: { min: 50000.0, max: 1000000000.0, step: 50000 },
                    }}
                  />
                  <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', alignSelf: 'center', mr: 0.5 }}>
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
                        sx={{ fontSize: '0.75rem', fontWeight: 600 }}
                      />
                    ))}
                  </Stack>
                </Box>

                <Divider />

                {/* 4. Relative Volume Range */}
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    4. Julat Nisbah Volum Relatif (Relative Volume / RVOL)
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
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
                          inputProps: { min: 0.0, max: 50.0, step: 0.1 },
                        }}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
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
                          inputProps: { min: 0.1, max: 100.0, step: 0.5 },
                        }}
                      />
                    </Grid>
                  </Grid>

                  <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', alignSelf: 'center', mr: 0.5 }}>
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
                        sx={{ fontSize: '0.75rem' }}
                      />
                    ))}
                  </Stack>
                </Box>

                {/* Form Action Buttons */}
                <Box sx={{ display: 'flex', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
                  <Button
                    id="btnSaveConfig"
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={saving}
                    startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
                    sx={{ px: 3, fontWeight: 700 }}
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
                    sx={{ fontWeight: 600 }}
                  >
                    Set Semula Lalai
                  </Button>
                </Box>
              </Box>
            </Paper>
          </Grid>

          {/* Sidebar / Info Column */}
          <Grid size={{ xs: 12, md: 5, lg: 4 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {/* Status Summary Card */}
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <InfoOutlinedIcon sx={{ color: sneatTokens.primary.main, fontSize: 20 }} />
                  Status Konfigurasi Semasa
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: '0.85rem' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Harga Min:</Typography>
                    <Typography id="displayMinPrice" variant="body2" sx={{ fontWeight: 700 }}>
                      ${Number(config.min_price).toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Market Cap Min:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {formatCurrency(config.min_market_cap)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>ADV20 Min:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {Number(config.min_volume).toLocaleString()} unit
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>Julat RVOL:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {config.min_rvol} - {config.max_rvol}
                    </Typography>
                  </Box>
                  <Divider sx={{ my: 0.5 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Kemas Kini Terakhir:</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {formatTimestamp(updatedAt)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Dikemas kini Oleh:</Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {updatedBy || 'system'}
                    </Typography>
                  </Box>
                </Box>
              </Paper>

              {/* Hard Bounds Notice */}
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: sneatTokens.warning.soft,
                  backgroundColor: sneatTokens.warning.soft,
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: sneatTokens.warning.main, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <SecurityIcon sx={{ fontSize: 18 }} />
                  Had Keselamatan Mandatori
                </Typography>
                <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.primary', lineHeight: 1.5 }}>
                  Berdasarkan piawaian perlindungan modal institutional, harga minimum saringan disekat daripada sebarang nilai di bawah <strong>$1.00</strong>. Sebarang cubaan menetapkan harga &lt; $1.00 akan disekat oleh backend validation.
                </Typography>
              </Paper>

              {/* Audit History Card */}
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <HistoryIcon sx={{ color: sneatTokens.secondary.main, fontSize: 20 }} />
                  Log Audit Perubahan
                </Typography>
                {auditLogs.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                    Tiada sejarah perubahan direkodkan setakat ini.
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 260, overflowY: 'auto' }}>
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
                          }}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main' }}>
                              {log.user}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {formatTimestamp(log.timestamp)}
                            </Typography>
                          </Box>
                          <Typography variant="caption" sx={{ color: 'text.primary', display: 'block' }}>
                            Harga: ${parsedNew.min_price} | Cap: {formatCurrency(parsedNew.min_market_cap)} | Vol: {Number(parsedNew.min_volume || 0).toLocaleString()}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Paper>
            </Box>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
