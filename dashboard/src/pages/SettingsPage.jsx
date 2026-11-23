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
  Paper,
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

export function SettingsPage({
  statusData,
  screenerConfig,
  onRefresh,
  initialTab,
  onToggleTradingMode,
  isTogglingTradingMode = false,
}) {
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
        setErrorMsg(errData.error || 'Failed to load screener configuration.');
      }

      if (auditRes.ok) {
        const aData = await auditRes.json();
        setAuditLogs(aData.audit || []);
      }
    } catch (err) {
      console.error('[SettingsPage] Error fetching config:', err);
      setErrorMsg('Network error while loading screener settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const validateField = (field, value) => {
    if (value === '' || value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
      return 'Value cannot be empty.';
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return 'Value must be a valid number';
    }

    if (field === 'min_price') {
      if (num < 1.0) {
        return 'Minimum price cannot be less than $1.00 (Safety Limit).';
      }
      if (num > 10000.0) {
        return 'Minimum price cannot exceed $10,000.00.';
      }
    }

    if (field === 'min_market_cap') {
      if (num < 10000000.0) {
        return 'Minimum market cap cannot be less than $10,000,000 ($10M).';
      }
      if (num > 10000000000000.0) {
        return 'Minimum market cap cannot exceed $10,000,000,000,000 ($10T).';
      }
    }

    if (field === 'min_volume') {
      if (num < 50000.0) {
        return 'Minimum ADV20 volume cannot be less than 50,000 shares.';
      }
      if (num > 1000000000.0) {
        return 'Minimum ADV20 volume cannot exceed 1,000,000,000 shares.';
      }
    }

    if (field === 'min_rvol') {
      if (num < 0.0 || num > 50.0) {
        return 'Minimum RVOL must be between 0.0 and 50.0.';
      }
    }

    if (field === 'max_rvol') {
      if (num < 0.1 || num > 100.0) {
        return 'Maximum RVOL must be between 0.1 and 100.0.';
      }
    }

    if (field === 'max_candidates_per_lane') {
      if (!Number.isInteger(num)) {
        return 'Candidates per lane must be an integer.';
      }
      if (num < 1 || num > 20) {
        return 'Candidates per lane must be between 1 and 20 stocks (Moomoo OpenAPI Quota Limit).';
      }
    }

    if (field === 'max_buying_power') {
      if (num < 500.0) {
        return 'Maximum buying power cannot be less than $500.00.';
      }
      if (num > 100000000.0) {
        return 'Maximum buying power cannot exceed $100,000,000.00 ($100M).';
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
      rvol_cross: minR > maxR ? 'Minimum RVOL cannot exceed maximum RVOL' : null,
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
    setSuccessMsg('Screener parameters reset to default recommended values. Click Save to apply.');
    setErrorMsg('');
  };

  const handleResetCapitalDefaults = () => {
    setConfig((prev) => ({
      ...prev,
      max_buying_power: DEFAULT_CONFIG.max_buying_power,
    }));
    setSuccessMsg('Capital ceiling reset to $100,000 (Default). Click Save to apply.');
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
      newErrors.rvol_cross = 'Minimum RVOL cannot exceed maximum RVOL.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...newErrors }));
      setErrorMsg(newErrors.min_price || newErrors.max_candidates_per_lane || newErrors.rvol_cross || 'Please fix invalid values before saving.');
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
        setSuccessMsg('Screener settings updated successfully! Next cycle will use these parameters dynamically.');
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
        setErrorMsg(data.error || 'Failed to update screener configuration.');
      }
    } catch (err) {
      console.error('[SettingsPage] Error saving screener config:', err);
      setErrorMsg('Server communication error while saving settings.');
    } finally {
      setSaving(false);
    }
  };

  const currentTradingMode = String(statusData?.trading_mode || config?.trading_mode || 'DAY').toUpperCase();

  const handleSettingsToggleTradingMode = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const nextMode = currentTradingMode === 'SWING' ? 'DAY' : 'SWING';
    if (onToggleTradingMode) {
      await onToggleTradingMode(nextMode);
      setSuccessMsg(`Trading mode successfully switched to ${nextMode}.`);
    } else {
      try {
        setSaving(true);
        const res = await fetch('/api/trading-mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: nextMode }),
        });
        const data = await res.json();
        if (res.ok) {
          setSuccessMsg(data.message || `Trading mode successfully switched to ${nextMode}.`);
          if (onRefresh) onRefresh();
          fetchConfig();
        } else {
          setErrorMsg(data.error || 'Failed to switch trading mode.');
        }
      } catch (err) {
        setErrorMsg('Network error while switching trading mode.');
      } finally {
        setSaving(false);
      }
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
        setSuccessMsg('Capital ceiling updated successfully! Position sizing and risk audit enforced immediately.');
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
        setErrorMsg(data.error || 'Failed to update capital ceiling.');
      }
    } catch (err) {
      console.error('[SettingsPage] Error saving capital config:', err);
      setErrorMsg('Server communication error while saving capital settings.');
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
            System Settings &amp; Gateway Management
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
            Configure L0 stock screening parameters, capital &amp; risk ceiling, and OpenD gateway session.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            icon={<SecurityIcon sx={{ fontSize: '14px !important' }} />}
            label="Boundary Limit: >= $1.00"
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
            label={`Capital Ceiling: ${formatCurrency(originalConfig.max_buying_power ?? 100000)}`}
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
            label="L0 Screener Parameters"
          />
          <Tab
            id="tab-capital-risk"
            icon={<AccountBalanceWalletIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Capital &amp; Risk Management"
          />
          <Tab
            id="tab-opend-gateway"
            icon={<SettingsIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="OpenD Gateway Management"
          />
          <Tab
            id="tab-agent-display"
            icon={<ViewListIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="Agent Activity Display"
          />
        </Tabs>
      </Box>

      {/* Tab 3: Agent Activity Display (Pagination) */}
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
                        Agent Activity Table Pagination Configuration
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Set default row count for the order transaction table in Agent Team Activity page.
                      </Typography>
                    </Box>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                    Entries Per Page (Options: 5, 10, 25, 50):
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
                    {[5, 10, 25, 50].map((pageSize) => {
                      const isSelected = Number(config.agent_orders_per_page || 10) === pageSize;
                      return (
                        <Chip
                          key={pageSize}
                          id={`chip-orders-page-${pageSize}`}
                          label={`${pageSize} entries / page`}
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
                      Current value: <strong id="displayAgentOrdersPerPage">{config.agent_orders_per_page || 10}</strong> rows per page
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
                          setSuccessMsg('Pagination configuration saved successfully.');
                          if (data.config) {
                            setConfig(data.config);
                            setOriginalConfig(data.config);
                          }
                        } catch (err) {
                          setErrorMsg('Error saving pagination configuration: ' + err.message);
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
                      Save Pagination Settings
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                    Agent Pagination Guidance
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                    This configuration syncs to SQLite database <code>screener_config.sqlite</code>. It serves as default rows in the table for <strong>L1 -&gt; L4: Agent Team Activity</strong>.
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

      {/* Tab 1: Capital & Risk Management */}
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
                {/* Card 0: Active Trading Mode (TRADING_MODE: DAY vs SWING) - HOM-351 */}
                <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
                  <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 2 }}>
                      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                        <Box
                          sx={{
                            width: 44,
                            height: 44,
                            borderRadius: '10px',
                            backgroundColor: currentTradingMode === 'SWING' ? 'rgba(105, 108, 255, 0.16)' : 'rgba(3, 195, 236, 0.16)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: currentTradingMode === 'SWING' ? '#696cff' : '#03c3ec',
                            flexShrink: 0,
                          }}
                        >
                          <SpeedIcon sx={{ fontSize: 24 }} />
                        </Box>
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                            Active Trading Mode (TRADING_MODE)
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                            Instant switch between Intraday (DAY) and Multi-Day (SWING)
                          </Typography>
                        </Box>
                      </Box>
                      <Chip
                        id="chip-settings-trading-mode"
                        label={currentTradingMode === 'SWING' ? 'MODE: SWING (MULTI-DAY)' : 'MODE: DAY (INTRADAY)'}
                        sx={{
                          backgroundColor: currentTradingMode === 'SWING' ? 'rgba(105, 108, 255, 0.16)' : 'rgba(3, 195, 236, 0.16)',
                          color: currentTradingMode === 'SWING' ? '#696cff' : '#03c3ec',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          height: 28,
                        }}
                      />
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    {/* Comparison Guide */}
                    <Grid container spacing={2} sx={{ mb: 2.5 }}>
                      <Grid item xs={12} sm={6}>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 2,
                            borderRadius: 2,
                            borderColor: currentTradingMode === 'DAY' ? '#03c3ec' : 'divider',
                            backgroundColor: currentTradingMode === 'DAY' ? 'rgba(3, 195, 236, 0.04)' : 'transparent',
                          }}
                        >
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#03c3ec', mb: 0.5 }}>
                            DAY Mode (Intraday)
                          </Typography>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary', mb: 0.5 }}>
                            &bull; <strong>Risk Limit:</strong> 2.0% equity per trade (Max $2,000)
                          </Typography>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary', mb: 0.5 }}>
                            &bull; <strong>Monitoring Interval:</strong> Every 5 minutes (300s) during active market
                          </Typography>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary', mb: 0.5 }}>
                            &bull; <strong>Screening:</strong> Momentum &amp; VCP Intraday (5-min/15-min)
                          </Typography>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                            &bull; <strong>Close:</strong> Mandatory square-off at 15:45 NY (No overnight holding)
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Paper
                          variant="outlined"
                          sx={{
                            p: 2,
                            borderRadius: 2,
                            borderColor: currentTradingMode === 'SWING' ? '#696cff' : 'divider',
                            backgroundColor: currentTradingMode === 'SWING' ? 'rgba(105, 108, 255, 0.04)' : 'transparent',
                          }}
                        >
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#696cff', mb: 0.5 }}>
                            SWING Mode (Multi-Day)
                          </Typography>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary', mb: 0.5 }}>
                            &bull; <strong>Risk Limit:</strong> 1.0% equity per trade (Max $1,000)
                          </Typography>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary', mb: 0.5 }}>
                            &bull; <strong>Monitoring Interval:</strong> 4H / Daily Cycle (09:00, 13:00, 16:30 NY) + 1H adaptive check
                          </Typography>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary', mb: 0.5 }}>
                            &bull; <strong>Screening:</strong> Daily EMA20 / 50-day SMA trend tracking
                          </Typography>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                            &bull; <strong>Holding:</strong> Multi-day holding allowed with trailing stop
                          </Typography>
                        </Paper>
                      </Grid>
                    </Grid>

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
                      <Button
                        id="btn-settings-toggle-trading-mode"
                        type="button"
                        variant="contained"
                        disabled={isTogglingTradingMode || saving}
                        onClick={handleSettingsToggleTradingMode}
                        sx={{
                          fontWeight: 700,
                          borderRadius: 2,
                          px: 3,
                          py: 1,
                          backgroundColor: currentTradingMode === 'SWING' ? '#03c3ec' : '#696cff',
                          '&:hover': {
                            backgroundColor: currentTradingMode === 'SWING' ? '#02a8cc' : '#5f61e6',
                          },
                        }}
                      >
                        {isTogglingTradingMode || saving
                          ? 'Switching Mode...'
                          : (currentTradingMode === 'SWING' ? 'Switch to DAY Mode' : 'Switch to SWING Mode')}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>

                {/* Card 1: Maximum Capital Ceiling (Limit Buying Power) */}
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
                            Maximum Capital Ceiling (Limit Buying Power)
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Effective capital ceiling for Haziq (L2) position sizing and Danial (L3) risk audit
                          </Typography>
                        </Box>
                      </Box>
                      <Chip
                        size="small"
                        label={`Current: ${formatCurrency(config.max_buying_power ?? 100000)}`}
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
                      helperText={errors.max_buying_power || 'Safety limit: minimum $500.00. Even if broker account balance is millions of dollars, agent system only uses this ceiling as effective capital.'}
                      InputProps={{
                        startAdornment: <InputAdornment position="start" sx={{ color: 'text.secondary', fontWeight: 600 }}>$</InputAdornment>,
                        endAdornment: <InputAdornment position="end" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>USD</InputAdornment>,
                        inputProps: { min: 500.0, max: 100000000.0, step: 1000.0 },
                      }}
                    />

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.5 }}>
                        Capital Ceiling Presets:
                      </Typography>
                      {[
                        { label: '$10,000 (Small Test)', val: 10000 },
                        { label: '$25,000 (PDT Minimum)', val: 25000 },
                        { label: '$50,000 (Conservative)', val: 50000 },
                        { label: '$100,000 (Default)', val: 100000 },
                        { label: '$500,000 (Institutional)', val: 500000 },
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
                        {saving ? 'Saving...' : 'Save Capital Limit'}
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
                        Reset Default Capital
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
                          Current Capital Ceiling Status
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          Active allocation ceiling in market runtime
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
                          Capital Ceiling:
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
                          Minimum Ceiling (BVA):
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
                          Maximum Ceiling (BVA):
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          $100,000,000.00 ($100M)
                        </Typography>
                      </Box>

                      <Divider sx={{ my: 0.5 }} />

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>Last Updated:</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {formatTimestamp(updatedAt)}
                        </Typography>
                      </Box>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>Updated By:</Typography>
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
                        Broker Account Air Gap Protection
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontSize: '0.825rem', color: 'text.primary', lineHeight: 1.6 }}>
                      This capital ceiling acts as a software safety air gap against real cash or margin balances on Moomoo OpenAPI, bounding overall bot risk exposure.
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
                          Change Audit Log
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          SQLite WAL Configuration Modification History
                        </Typography>
                      </Box>
                    </Box>

                    {auditLogs.length === 0 ? (
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                        No configuration changes recorded yet.
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
                                  ? `Capital Limit: ${formatCurrency(parsedNew.max_buying_power)}`
                                  : `Price: $${parsedNew.min_price} | Vol: ${Number(parsedNew.min_volume || 0).toLocaleString()} | Lane: ${parsedNew.max_candidates_per_lane || 5}`}
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
                            1. Minimum Stock Price (MIN_PRICE)
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Filter out sub-dollar &amp; high-risk penny stocks
                          </Typography>
                        </Box>
                      </Box>
                      <Chip
                        size="small"
                        label={`Current: $${Number(config.min_price).toFixed(2)}`}
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
                      helperText={errors.min_price || 'Safety limit: Minimum price locked above $1.00. Valid range: $1.00 - $10,000.00.'}
                      InputProps={{
                        startAdornment: <InputAdornment position="start" sx={{ color: 'text.secondary', fontWeight: 600 }}>$</InputAdornment>,
                        endAdornment: <InputAdornment position="end" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>USD</InputAdornment>,
                        inputProps: { min: 1.0, max: 10000.0, step: 0.5 },
                      }}
                    />

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.5 }}>
                        Quick Presets:
                      </Typography>
                      {[
                        { label: '$1.00 (Boundary)', val: 1.0 },
                        { label: '$2.00 (Small Cap)', val: 2.0 },
                        { label: '$5.00 (Standard)', val: 5.0 },
                        { label: '$10.00 (Default)', val: 10.0 },
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
                            2. Minimum Market Capitalization (MIN_MARKET_CAP)
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Filter out micro-cap &amp; shell companies lacking liquidity
                          </Typography>
                        </Box>
                      </Box>
                      <Chip
                        size="small"
                        label={`Current: ${formatCurrency(config.min_market_cap)}`}
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
                      helperText={errors.min_market_cap || 'Full USD value (e.g. $1,000,000,000 = 1B). Valid range: $10,000,000 ($10M) to $10,000,000,000,000 ($10T).'}
                      InputProps={{
                        startAdornment: <InputAdornment position="start" sx={{ color: 'text.secondary', fontWeight: 600 }}>$</InputAdornment>,
                        endAdornment: <InputAdornment position="end" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>USD</InputAdornment>,
                        inputProps: { min: 10000000.0, max: 10000000000000.0, step: 100000000.0 },
                      }}
                    />

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.5 }}>
                        Cap Presets:
                      </Typography>
                      {[
                        { label: '$100M (Micro)', val: 100000000.0 },
                        { label: '$300M (Small)', val: 300000000.0 },
                        { label: '$1B (Default - Mid)', val: 1000000000.0 },
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
                            3. Minimum 20-Day Average Daily Volume (MIN_VOLUME ADV20)
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Sufficient daily liquidity to prevent execution slippage
                          </Typography>
                        </Box>
                      </Box>
                      <Chip
                        size="small"
                        label={`Current: ${Number(config.min_volume).toLocaleString()} units`}
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
                      helperText={errors.min_volume || 'Average daily trading volume (ADV20). Valid range: 50,000 to 1,000,000,000 shares.'}
                      InputProps={{
                        endAdornment: <InputAdornment position="end" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>shares / day</InputAdornment>,
                        inputProps: { min: 50000.0, max: 1000000000.0, step: 50000.0 },
                      }}
                    />

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.5 }}>
                        Volume Presets:
                      </Typography>
                      {[
                        { label: '100k', val: 100000.0 },
                        { label: '500k', val: 500000.0 },
                        { label: '1M (Default)', val: 1000000.0 },
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
                            4. Relative Volume Ratio Range (MIN_RVOL &amp; MAX_RVOL)
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Measures institutional activity surge (RVOL &gt; 1.0) versus standard average
                          </Typography>
                        </Box>
                      </Box>
                      <Chip
                        size="small"
                        label={`Current: ${config.min_rvol} - ${config.max_rvol}`}
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
                          helperText={errors.min_rvol || 'Lower limit (e.g. 0.50). Valid range: 0.0 - 50.0.'}
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
                          helperText={errors.max_rvol || errors.rvol_cross || 'Upper limit (e.g. 20.0). Valid range: 0.1 - 100.0.'}
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
                            5. Candidate Limit Per L0 Lane (MAX_CANDIDATES_PER_LANE)
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Ceiling for Stage 3 K-line enrichment candidates across MOMENTUM &amp; SETUP lanes
                          </Typography>
                        </Box>
                      </Box>
                      <Chip
                        size="small"
                        label={`Current: ${config.max_candidates_per_lane ?? 5} stocks/lane`}
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
                      helperText={errors.max_candidates_per_lane || 'Moomoo OpenAPI quota protection (100 symbols / 30-day rolling). Dual-lane: 2 x limit = max candidates per scan. Valid range: 1 to 20 stocks.'}
                      InputProps={{
                        endAdornment: <InputAdornment position="end" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>stocks / lane</InputAdornment>,
                        inputProps: { min: 1, max: 20, step: 1 },
                      }}
                    />

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1.5, flexWrap: 'wrap' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mr: 0.5 }}>
                        Preset Lorong:
                      </Typography>
                      {[
                        { label: 'Conservative (3 stocks / 6 max)', val: 3 },
                        { label: 'Default (5 stocks / 10 max)', val: 5 },
                        { label: 'Aggressive (10 stocks / 20 max)', val: 10 },
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
                        {saving ? 'Saving...' : 'Save Screener Settings'}
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
                        Reset Default
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
                          Current Configuration Status
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          Physical stock filtering parameters in L0
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
                          Min Price:
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
                          RVOL Range:
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
                          {originalConfig.max_candidates_per_lane ?? 5} stocks
                        </Typography>
                      </Box>

                      <Divider sx={{ my: 0.5 }} />

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>Last Updated:</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {formatTimestamp(updatedAt)}
                        </Typography>
                      </Box>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 0.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>Updated By:</Typography>
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
                      Moomoo broker limits historical K-lines to <strong>100 unique symbols / 30 rolling days</strong>. The maximum ceiling of 20 stocks per lane (40 dual-lane candidates) protects daily quota budget (~4-5 new symbols) against exhaustion.
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
                        Mandatory Safety Limit ($1.00)
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontSize: '0.825rem', color: 'text.primary', lineHeight: 1.6 }}>
                      Based on institutional capital protection standards, the minimum screening price is locked above <strong>$1.00</strong>. Any attempt to set a price &lt; $1.00 will be blocked immediately by backend validation.
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
                          Change Audit Log
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                          SQLite WAL Configuration Modification History
                        </Typography>
                      </Box>
                    </Box>

                    {auditLogs.length === 0 ? (
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                        No configuration changes recorded yet.
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
                                Price: ${parsedNew.min_price} | Cap: {formatCurrency(parsedNew.min_market_cap)} | Vol: {Number(parsedNew.min_volume || 0).toLocaleString()} | RVOL: {parsedNew.min_rvol}-{parsedNew.max_rvol} | Lane: {parsedNew.max_candidates_per_lane || 5}
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
