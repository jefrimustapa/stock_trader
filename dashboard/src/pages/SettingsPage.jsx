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
import ShieldIcon from '@mui/icons-material/Shield';
import PsychologyIcon from '@mui/icons-material/Psychology';
import GavelIcon from '@mui/icons-material/Gavel';
import SyncIcon from '@mui/icons-material/Sync';
import ViewListIcon from '@mui/icons-material/ViewList';
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
  agent_orders_per_page: 10,
};

export function SettingsPage({ statusData, onRefresh, initialTab }) {
  const getInitialTab = () => {
    if (typeof initialTab === 'number') return initialTab;
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      if (hash.includes('tab=display') || hash.includes('tab=pagination') || hash.includes('tab=agent')) return 3;
      if (hash.includes('tab=opend') || hash.includes('opend')) return 2;
      if (hash.includes('tab=capital') || hash.includes('tab=risk') || hash.includes('tab=modal') || hash.includes('capital') || hash.includes('risk')) return 1;
    }
    return 0;
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  useEffect(() => {
    const checkHashTab = () => {
      if (typeof window !== 'undefined') {
        const hash = window.location.hash || '';
        if (hash.includes('tab=display') || hash.includes('tab=pagination') || hash.includes('tab=agent')) {
          setActiveTab(3);
        } else if (hash.includes('tab=opend') || hash.includes('opend')) {
          setActiveTab(2);
        } else if (hash.includes('tab=capital') || hash.includes('tab=risk') || hash.includes('tab=modal') || hash.includes('capital') || hash.includes('risk')) {
          setActiveTab(1);
        } else if (hash.includes('settings')) {
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
      if (newValue === 3) {
        window.location.hash = '#/settings?tab=display';
      } else if (newValue === 2) {
        window.location.hash = '#/settings?tab=opend';
      } else if (newValue === 1) {
        window.location.hash = '#/settings?tab=capital';
      } else {
        window.location.hash = '#/settings?tab=screener';
      }
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

  const handleResetScreenerDefaults = () => {
    setConfig((prev) => ({
      ...prev,
      min_price: DEFAULT_CONFIG.min_price,
      min_market_cap: DEFAULT_CONFIG.min_market_cap,
      min_volume: DEFAULT_CONFIG.min_volume,
      min_rvol: DEFAULT_CONFIG.min_rvol,
      max_rvol: DEFAULT_CONFIG.max_rvol,
      max_candidates_per_lane: DEFAULT_CONFIG.max_candidates_per_lane,
    }));
    setSuccessMsg('Parameter screener telah diset semula kepada nilai cadangan lalai. Tekan Simpan untuk menguatkuasakan.');
    setErrorMsg('');
  };

  const handleResetCapitalDefaults = () => {
    setConfig((prev) => ({
      ...prev,
      max_buying_power: DEFAULT_CONFIG.max_buying_power,
    }));
    setSuccessMsg('Had siling modal telah diset semula kepada $100,000 (Lalai). Tekan Simpan untuk menguatkuasakan.');
    setErrorMsg('');
  };

  const handleSaveScreener = async (e) => {
    if (e) e.preventDefault();
    setSuccessMsg('');
    setErrorMsg('');

    const screenerFields = ['min_price', 'min_market_cap', 'min_volume', 'min_rvol', 'max_rvol', 'max_candidates_per_lane'];
    const newErrors = {};
    screenerFields.forEach((k) => {
      const err = validateField(k, config[k]);
      if (err) newErrors[k] = err;
    });

    if (Number(config.min_rvol) > Number(config.max_rvol)) {
      newErrors.rvol_cross = 'RVOL minimum tidak boleh melebihi RVOL maksimum.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...newErrors }));
      setErrorMsg(newErrors.min_price || newErrors.max_candidates_per_lane || newErrors.rvol_cross || 'Sila betulkan nilai yang tidak sah sebelum menyimpan.');
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
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setConfig((prev) => ({ ...prev, ...data.config }));
        setOriginalConfig((prev) => ({ ...prev, ...data.config }));
        setUpdatedAt(data.updated_at);
        setUpdatedBy(data.updated_by);
        setSuccessMsg('Tetapan screener berjaya dikemas kini! Kitaran seterusnya akan menggunakan parameter ini secara dinamik.');
        setErrors({});

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('screener-config-updated', { detail: data.config }));
        }

        const auditRes = await fetch('/api/screener/config/audit');
        if (auditRes.ok) {
          const aData = await auditRes.json();
          setAuditLogs(aData.audit || []);
        }
      } else {
        setErrorMsg(data.error || 'Gagal mengemas kini konfigurasi screener.');
      }
    } catch (err) {
      console.error('[SettingsPage] Error saving screener config:', err);
      setErrorMsg('Ralat komunikasi pelayan semasa menyimpan tetapan.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCapital = async (e) => {
    if (e) e.preventDefault();
    setSuccessMsg('');
    setErrorMsg('');

    const err = validateField('max_buying_power', config.max_buying_power);
    if (err) {
      setErrors((prev) => ({ ...prev, max_buying_power: err }));
      setErrorMsg(err);
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
          max_buying_power: Number(config.max_buying_power),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setConfig((prev) => ({ ...prev, ...data.config }));
        setOriginalConfig((prev) => ({ ...prev, ...data.config }));
        setUpdatedAt(data.updated_at);
        setUpdatedBy(data.updated_by);
        setSuccessMsg('Had siling modal berjaya dikemas kini! Asas saiz posisi Haziq (L2) & had risiko Danial (L3) dikuatkuasakan serta-merta tanpa restart.');
        setErrors({});

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('screener-config-updated', { detail: data.config }));
        }

        const auditRes = await fetch('/api/screener/config/audit');
        if (auditRes.ok) {
          const aData = await auditRes.json();
          setAuditLogs(aData.audit || []);
        }
      } else {
        setErrorMsg(data.error || 'Gagal mengemas kini had siling modal.');
      }
    } catch (err) {
      console.error('[SettingsPage] Error saving capital config:', err);
      setErrorMsg('Ralat komunikasi pelayan semasa menyimpan tetapan modal.');
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
            Konfigurasi parameter saringan saham L0, had siling modal &amp; risiko, dan kawalan sesi gerbang OpenD.
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
            id="badgeModalCeilingHeader"
            size="small"
            icon={<AccountBalanceWalletIcon sx={{ fontSize: '14px !important' }} />}
            label={`Had Siling Modal: ${formatCurrency(originalConfig.max_buying_power ?? 100000)}`}
            clickable
            onClick={() => handleTabChange(null, 1)}
            sx={{
              fontWeight: 700,
              backgroundColor: sneatTokens.success.soft,
              color: sneatTokens.success.main,
              borderRadius: 1.5,
            }}
          />
        </Box>
      </Box>

      {/* Navigation Tabs between Screener Config, Capital & Risk, and OpenD Gateway */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          aria-label="Settings, Capital Risk, and OpenD Gateway tabs"
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
            label="Parameter Screener L0"
          />
          <Tab
            id="tab-capital-risk"
            icon={<AccountBalanceWalletIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Pengurusan Modal &amp; Risiko"
          />
          <Tab
            id="tab-opend-gateway"
            icon={<SettingsIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Pengurusan Gerbang OpenD"
          />
          <Tab
            id="tab-agent-display"
            icon={<ViewListIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Paparan Aktiviti Ejen"
          />
        </Tabs>
      </Box>

      {/* Tab 3: Paparan Aktiviti Ejen (Paginasi) */}
      {activeTab === 3 && (
        <Box id="tab-panel-display" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 0.5 }}>
          {successMsg && (
            <Alert
              id="displayAlertSuccess"
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
              id="displayAlertError"
              severity="error"
              onClose={() => setErrorMsg('')}
              sx={{ borderRadius: 2 }}
            >
              {errorMsg}
            </Alert>
          )}

          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>
              <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
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
                      }}
                    >
                      <ViewListIcon sx={{ fontSize: 24 }} />
                    </Box>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Konfigurasi Paginasi Jadual Aktiviti Ejen
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Tetapkan bilangan entri lalai bagi jadual pesanan transaksi di halaman Aktiviti Pasukan Ejen.
                      </Typography>
                    </Box>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                    Bilangan Entri Per Halaman (Pilihan: 5, 10, 25, 50):
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
                    {[5, 10, 25, 50].map((pageSize) => {
                      const isSelected = Number(config.agent_orders_per_page || 10) === pageSize;
                      return (
                        <Chip
                          key={pageSize}
                          id={`chip-orders-page-${pageSize}`}
                          label={`${pageSize} entri / halaman`}
                          clickable
                          onClick={() => setConfig({ ...config, agent_orders_per_page: pageSize })}
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            py: 2.2,
                            px: 1.5,
                            borderRadius: 2,
                            backgroundColor: isSelected ? sneatTokens.primary.main : 'action.hover',
                            color: isSelected ? '#FFFFFF' : 'text.primary',
                            border: isSelected ? 'none' : '1px solid',
                            borderColor: 'divider',
                            '&:hover': {
                              backgroundColor: isSelected ? sneatTokens.primary.main : sneatTokens.primary.soft,
                            },
                          }}
                        />
                      );
                    })}
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 4 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      Nilai semasa: <strong id="displayAgentOrdersPerPage">{config.agent_orders_per_page || 10}</strong> entri per halaman
                    </Typography>

                    <Button
                      id="btnSaveAgentDisplayConfig"
                      variant="contained"
                      color="primary"
                      startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                      disabled={saving}
                      onClick={async () => {
                        try {
                          setSaving(true);
                          setSuccessMsg('');
                          setErrorMsg('');
                          const res = await fetch('/api/screener/config', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              agent_orders_per_page: Number(config.agent_orders_per_page || 10),
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            throw new Error(data.error || `HTTP ${res.status}`);
                          }
                          setSuccessMsg('Konfigurasi paginasi berjaya disimpan.');
                          if (data.config) {
                            setConfig(data.config);
                            setOriginalConfig(data.config);
                          }
                        } catch (err) {
                          setErrorMsg('Ralat menyimpan konfigurasi paginasi: ' + err.message);
                        } finally {
                          setSaving(false);
                        }
                      }}
                      sx={{
                        borderRadius: 2,
                        px: 3,
                        fontWeight: 700,
                        textTransform: 'none',
                      }}
                    >
                      Simpan Tetapan Paginasi
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                    Panduan Paginasi Ejen
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                    Konfigurasi ini disegerakkan ke pangkalan data SQLite <code>screener_config.sqlite</code>. Nilai ini menjadi bilangan entri lalai pada komponen jadual <strong>L1 -&gt; L4: Aktiviti Pasukan Ejen</strong>.
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Tab 2: OpenD Gateway Control Panel */}
      {activeTab === 2 && (
        <Box id="tab-panel-opend" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
          <OpendControlPanel statusData={statusData} onRefresh={onRefresh} />
        </Box>
      )}

      {/* Tab 1: Pengurusan Modal & Risiko */}
      {activeTab === 1 && (
        <Box id="tab-panel-capital" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 0.5 }}>
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
                borderColor: sneatTokens.danger.main,
                fontWeight: 500,
              }}
            >
              {errorMsg}
            </Alert>
          )}

          <Grid container spacing={2.5}>
            {/* Main Form Column (Left - 7.5 col) */}
            <Grid item xs={12} md={7} lg={7.5}>
              <Box component="form" onSubmit={handleSaveCapital} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                {/* Card 1: Had Siling Modal Maksimum (Limit Buying Power) */}
                <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                  <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 2 }}>
                      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                        <Box
                          sx={{
                            width: 44,
                            height: 44,
                            borderRadius: '10px',
                            backgroundColor: sneatTokens.success.soft,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: sneatTokens.success.main,
                            flexShrink: 0,
                          }}
                        >
                          <AccountBalanceWalletIcon sx={{ fontSize: 26 }} />
                        </Box>
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '1.05rem', color: 'text.primary' }}>
                            Had Siling Modal Maksimum (Limit Buying Power)
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
                        id="btnSaveCapitalConfig"
                        type="submit"
                        variant="contained"
                        color="primary"
                        onClick={handleSaveCapital}
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
                        {saving ? 'Menyimpan...' : 'Simpan Had Modal'}
                      </Button>
                      <Button
                        id="btnResetCapitalDefaults"
                        type="button"
                        variant="outlined"
                        color="secondary"
                        disabled={saving}
                        startIcon={<RestartAltIcon />}
                        onClick={handleResetCapitalDefaults}
                        sx={{
                          flex: { xs: '1 1 100%', sm: 'none' },
                          px: 2.5,
                          py: 1.1,
                          fontWeight: 600,
                          borderRadius: 2,
                        }}
                      >
                        Set Semula Modal Lalai
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            </Grid>

            {/* Sidebar Column (Right - 4.5 col) */}
            <Grid item xs={12} md={5} lg={4.5}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Capital Summary Card */}
                <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                  <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                      <Box
                        sx={{
                          width: 38,
                          height: 38,
                          borderRadius: '8px',
                          backgroundColor: sneatTokens.success.soft,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: sneatTokens.success.main,
                        }}
                      >
                        <AccountBalanceWalletIcon sx={{ fontSize: 22 }} />
                      </Box>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                          Status Had Modal Semasa
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          Siling peruntukan aktif dalam runtime pasaran
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
                          Had Siling Modal:
                        </Typography>
                        <Typography id="displayMaxBuyingPower" variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>
                          {formatCurrency(originalConfig.max_buying_power ?? 100000)}
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
                          Penguatkuasaan:
                        </Typography>
                        <Chip
                          size="small"
                          label="Aktif (Live WAL Sync)"
                          sx={{ height: 22, fontSize: '0.72rem', fontWeight: 700, backgroundColor: sneatTokens.success.soft, color: sneatTokens.success.main, borderRadius: 1 }}
                        />
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
                          Siling Minima (BVA):
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          $500.00
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
                          Siling Maksima (BVA):
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          $100,000,000.00 ($100M)
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

                {/* Air Gap Safety Notice */}
                <Card
                  sx={{
                    border: '1px solid',
                    borderColor: sneatTokens.info.main,
                    borderRadius: 2.5,
                    backgroundColor: sneatTokens.info.soft,
                  }}
                >
                  <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
                      <SecurityIcon sx={{ color: sneatTokens.info.main, fontSize: 22 }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: sneatTokens.info.main }}>
                        Perlindungan Air Gap Akaun Broker
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontSize: '0.825rem', color: 'text.primary', lineHeight: 1.6 }}>
                      Had siling modal ini bertindak sebagai pemisah keselamatan perisian (air gap) terhadap jumlah baki tunai atau kemudahan margin akaun sebenar Moomoo OpenAPI, membendung pendedahan risiko bot secara menyeluruh.
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
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, maxHeight: 240, overflowY: 'auto' }}>
                        {auditLogs.slice(0, 6).map((log) => {
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
                                {parsedNew.max_buying_power !== undefined
                                  ? `Had Modal: ${formatCurrency(parsedNew.max_buying_power)}`
                                  : `Harga: $${parsedNew.min_price} | Vol: ${Number(parsedNew.min_volume || 0).toLocaleString()} | Lorong: ${parsedNew.max_candidates_per_lane || 5}`}
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
        </Box>
      )}

      {/* Tab 0: Parameter Screener L0 (Pure Physical Screening Parameters) */}
      {activeTab === 0 && (
        <Box id="tab-panel-screener" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 0.5 }}>
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
                borderColor: sneatTokens.danger.main,
                fontWeight: 500,
              }}
            >
              {errorMsg}
            </Alert>
          )}

          <Grid container spacing={2.5}>
            {/* Main Form Column (Left - 7.5 col) */}
            <Grid item xs={12} md={7} lg={7.5}>
              <Box component="form" onSubmit={handleSaveScreener} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                {/* 1. Min Price Section Card */}
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
                          <AttachMoneyIcon sx={{ fontSize: 24 }} />
                        </Box>
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary' }}>
                            1. Harga Minimum Saham (MIN_PRICE)
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Penapisan kaunter saham sen &amp; penny stock berisiko manipulasi tinggi
                          </Typography>
                        </Box>
                      </Box>
                      <Chip
                        size="small"
                        label={`Semasa: $${Number(config.min_price).toFixed(2)}`}
                        sx={{ fontWeight: 600, backgroundColor: 'action.hover', borderRadius: 1.5, flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }}
                      />
                    </Box>

                    <TextField
                      id="inputMinPrice"
                      name="min_price"
                      fullWidth
                      size="small"
                      type="number"
                      value={config.min_price}
                      onChange={(e) => handleFieldChange('min_price', e.target.value)}
                      error={Boolean(errors.min_price)}
                      helperText={errors.min_price || 'Had keselamatan: Harga minima disekat daripada sebarang nilai di bawah $1.00. Julat sah: $1.00 - $10,000.00.'}
                      InputProps={{
                        startAdornment: <InputAdornment position="start" sx={{ color: 'text.secondary', fontWeight: 600 }}>$</InputAdornment>,
                        endAdornment: <InputAdornment position="end" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>USD</InputAdornment>,
                        inputProps: { min: 1.0, max: 10000.0, step: 0.5 },
                      }}
                    />

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.5 }}>
                        Preset Pantas:
                      </Typography>
                      {[
                        { label: '$1.00 (Sempadan)', val: 1.0 },
                        { label: '$2.00 (Small Cap)', val: 2.0 },
                        { label: '$5.00 (Standard)', val: 5.0 },
                        { label: '$10.00 (Lalai)', val: 10.0 },
                        { label: '$15.00 (Mid/Large)', val: 15.0 },
                      ].map((p) => (
                        <Chip
                          key={p.label}
                          label={p.label}
                          size="small"
                          clickable
                          variant="outlined"
                          onClick={() => handlePresetPrice(p.val)}
                          sx={{ fontSize: '0.75rem', fontWeight: 600, borderRadius: 1.5 }}
                        />
                      ))}
                    </Box>
                  </CardContent>
                </Card>

                {/* 2. Min Market Cap Section Card */}
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
                          <AccountBalanceIcon sx={{ fontSize: 24 }} />
                        </Box>
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary' }}>
                            2. Permodalan Pasaran Minimum (MIN_MARKET_CAP)
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Menapis syarikat mikro &amp; shell companies yang tidak mempunyai kecairan kukuh
                          </Typography>
                        </Box>
                      </Box>
                      <Chip
                        size="small"
                        label={`Semasa: ${formatCurrency(config.min_market_cap)}`}
                        sx={{ fontWeight: 600, backgroundColor: 'action.hover', borderRadius: 1.5, flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }}
                      />
                    </Box>

                    <TextField
                      id="inputMinMarketCap"
                      name="min_market_cap"
                      fullWidth
                      size="small"
                      type="number"
                      value={config.min_market_cap}
                      onChange={(e) => handleFieldChange('min_market_cap', e.target.value)}
                      error={Boolean(errors.min_market_cap)}
                      helperText={errors.min_market_cap || 'Nilai dalam USD penuh (cth: $1,000,000,000 = 1B). Julat sah: $10,000,000 ($10M) hingga $10,000,000,000,000 ($10T).'}
                      InputProps={{
                        startAdornment: <InputAdornment position="start" sx={{ color: 'text.secondary', fontWeight: 600 }}>$</InputAdornment>,
                        endAdornment: <InputAdornment position="end" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>USD</InputAdornment>,
                        inputProps: { min: 10000000.0, max: 10000000000000.0, step: 100000000.0 },
                      }}
                    />

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.5 }}>
                        Preset Cap:
                      </Typography>
                      {[
                        { label: '$100M (Micro)', val: 100000000.0 },
                        { label: '$300M (Small)', val: 300000000.0 },
                        { label: '$1B (Lalai - Mid)', val: 1000000000.0 },
                        { label: '$2B (Mid Cap)', val: 2000000000.0 },
                        { label: '$10B (Large Cap)', val: 10000000000.0 },
                      ].map((p) => (
                        <Chip
                          key={p.label}
                          label={p.label}
                          size="small"
                          clickable
                          variant="outlined"
                          onClick={() => handlePresetCap(p.val)}
                          sx={{ fontSize: '0.75rem', fontWeight: 600, borderRadius: 1.5 }}
                        />
                      ))}
                    </Box>
                  </CardContent>
                </Card>

                {/* 3. Min Volume ADV20 Section Card */}
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
                          <BarChartIcon sx={{ fontSize: 24 }} />
                        </Box>
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary' }}>
                            3. Volum Harian Purata 20-Hari Minimum (MIN_VOLUME ADV20)
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Kecairan pasaran harian mencukupi untuk elak slippage pesanan
                          </Typography>
                        </Box>
                      </Box>
                      <Chip
                        size="small"
                        label={`Semasa: ${Number(config.min_volume).toLocaleString()} unit`}
                        sx={{ fontWeight: 600, backgroundColor: 'action.hover', borderRadius: 1.5, flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }}
                      />
                    </Box>

                    <TextField
                      id="inputMinVolume"
                      name="min_volume"
                      fullWidth
                      size="small"
                      type="number"
                      value={config.min_volume}
                      onChange={(e) => handleFieldChange('min_volume', e.target.value)}
                      error={Boolean(errors.min_volume)}
                      helperText={errors.min_volume || 'Purata bilangan saham didagangkan setiap hari (ADV20). Julat sah: 50,000 hingga 1,000,000,000 saham.'}
                      InputProps={{
                        endAdornment: <InputAdornment position="end" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>saham / hari</InputAdornment>,
                        inputProps: { min: 50000.0, max: 1000000000.0, step: 50000.0 },
                      }}
                    />

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.5 }}>
                        Preset Volum:
                      </Typography>
                      {[
                        { label: '100k', val: 100000.0 },
                        { label: '500k', val: 500000.0 },
                        { label: '1M (Lalai)', val: 1000000.0 },
                        { label: '2M', val: 2000000.0 },
                        { label: '5M (Ultra Liquid)', val: 5000000.0 },
                      ].map((p) => (
                        <Chip
                          key={p.label}
                          label={p.label}
                          size="small"
                          clickable
                          variant="outlined"
                          onClick={() => handlePresetVol(p.val)}
                          sx={{ fontSize: '0.75rem', fontWeight: 600, borderRadius: 1.5 }}
                        />
                      ))}
                    </Box>
                  </CardContent>
                </Card>

                {/* 4. Relative Volume Range (RVOL) Section Card */}
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
                          <SpeedIcon sx={{ fontSize: 24 }} />
                        </Box>
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '1rem', color: 'text.primary' }}>
                            4. Julat Nisbah Volum Relatif (MIN_RVOL &amp; MAX_RVOL)
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Mengukur lonjakan aktiviti institusi (RVOL &gt; 1.0) berbanding purata biasa
                          </Typography>
                        </Box>
                      </Box>
                      <Chip
                        size="small"
                        label={`Semasa: ${config.min_rvol} - ${config.max_rvol}`}
                        sx={{ fontWeight: 600, backgroundColor: 'action.hover', borderRadius: 1.5, flexShrink: 0, display: { xs: 'none', sm: 'inline-flex' } }}
                      />
                    </Box>

                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          id="inputMinRvol"
                          name="min_rvol"
                          fullWidth
                          size="small"
                          type="number"
                          label="RVOL Minimum"
                          value={config.min_rvol}
                          onChange={(e) => handleFieldChange('min_rvol', e.target.value)}
                          error={Boolean(errors.min_rvol || errors.rvol_cross)}
                          helperText={errors.min_rvol || 'Had bawah (cth: 0.50). Julat sah: 0.0 - 50.0.'}
                          InputProps={{
                            inputProps: { min: 0.0, max: 50.0, step: 0.1 },
                          }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          id="inputMaxRvol"
                          name="max_rvol"
                          fullWidth
                          size="small"
                          type="number"
                          label="RVOL Maksimum"
                          value={config.max_rvol}
                          onChange={(e) => handleFieldChange('max_rvol', e.target.value)}
                          error={Boolean(errors.max_rvol || errors.rvol_cross)}
                          helperText={errors.max_rvol || errors.rvol_cross || 'Had atas (cth: 20.0). Julat sah: 0.1 - 100.0.'}
                          InputProps={{
                            inputProps: { min: 0.1, max: 100.0, step: 0.5 },
                          }}
                        />
                      </Grid>
                    </Grid>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.5 }}>
                        Preset RVOL:
                      </Typography>
                      {[
                        { label: 'Standard (0.5 - 20.0)', min: 0.5, max: 20.0 },
                        { label: 'Momentum Kuat (1.2 - 25.0)', min: 1.2, max: 25.0 },
                        { label: 'Breakout Tulen (2.0 - 30.0)', min: 2.0, max: 30.0 },
                        { label: 'Tenang (0.3 - 10.0)', min: 0.3, max: 10.0 },
                      ].map((p) => (
                        <Chip
                          key={p.label}
                          label={p.label}
                          size="small"
                          clickable
                          variant="outlined"
                          onClick={() => handlePresetRvol(p.min, p.max)}
                          sx={{ fontSize: '0.75rem', fontWeight: 600, borderRadius: 1.5 }}
                        />
                      ))}
                    </Box>
                  </CardContent>
                </Card>

                {/* 5. Max Candidates Per Lane (MAX_CANDIDATES_PER_LANE) */}
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
                            5. Had Calon Per Lorong L0 (MAX_CANDIDATES_PER_LANE)
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

                {/* Form Action Controls Card */}
                <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, backgroundColor: 'background.paper' }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
                      <Button
                        id="btnSaveConfig"
                        type="submit"
                        variant="contained"
                        color="primary"
                        onClick={handleSaveScreener}
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
                        {saving ? 'Menyimpan...' : 'Simpan Tetapan Screener'}
                      </Button>
                      <Button
                        id="btnResetDefaults"
                        type="button"
                        variant="outlined"
                        color="secondary"
                        disabled={saving}
                        startIcon={<RestartAltIcon />}
                        onClick={handleResetScreenerDefaults}
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

            {/* Sidebar Column (Right - 4.5 col) */}
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
                          Parameter penapisan saham fizikal di L0
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
        </Box>
      )}
    </Box>
  );
}
