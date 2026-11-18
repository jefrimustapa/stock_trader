import React, { useState, useEffect, useCallback } from 'react';
import { ThemeProvider, CssBaseline, Box, CircularProgress, Typography } from '@mui/material';
import { getTheme } from './theme';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { OverviewPage } from './pages/OverviewPage';
import { OpendPage } from './pages/OpendPage';
import { FunnelPage } from './pages/FunnelPage';
import { WatchlistPage } from './pages/WatchlistPage';
import { L0Page } from './pages/L0Page';
import { SettingsPage } from './pages/SettingsPage';
import { QuotaPage } from './pages/QuotaPage';
import { AgentsPage } from './pages/AgentsPage';

const VALID_PAGES = ['overview', 'l0', 'agents', 'opend', 'funnel', 'watchlist', 'settings', 'quota'];

export function App() {
  const [mode, setMode] = useState(() => {
    return (typeof localStorage !== 'undefined' && localStorage.getItem('stock_trader_theme_mode')) || 'dark';
  });

  const getPageFromHash = () => {
    if (typeof window === 'undefined') return 'overview';
    const cleanHash = (window.location.hash || '').replace(/^#\/?/, '').trim().toLowerCase();
    if (cleanHash === 'opend' || cleanHash.startsWith('opend')) {
      if (typeof window !== 'undefined') {
        window.location.hash = '#/settings?tab=opend';
      }
      return 'settings';
    }
    const pageOnly = cleanHash.split('?')[0];
    if (pageOnly === 'funnel' || pageOnly === 'watchlist') {
      return 'l0';
    }
    return VALID_PAGES.includes(pageOnly) ? pageOnly : 'overview';
  };

  const [currentPage, setCurrentPage] = useState(getPageFromHash);
  const [statusData, setStatusData] = useState(null);
  const [dataPayload, setDataPayload] = useState(null);
  const [screenerConfig, setScreenerConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState(false);
  const [loading, setLoading] = useState(true);

  const toggleMode = () => {
    const nextMode = mode === 'dark' ? 'light' : 'dark';
    setMode(nextMode);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('stock_trader_theme_mode', nextMode);
    }
  };

  const navigateTo = (pageId, tab) => {
    if (pageId === 'opend') {
      setCurrentPage('settings');
      if (typeof window !== 'undefined') {
        window.location.hash = '#/settings?tab=opend';
      }
      return;
    }
    let pageOnly = pageId ? pageId.split('?')[0] : 'overview';
    if (pageOnly === 'funnel' || pageOnly === 'watchlist') {
      pageOnly = 'l0';
    }
    if (VALID_PAGES.includes(pageOnly)) {
      setCurrentPage(pageOnly);
      if (typeof window !== 'undefined') {
        window.location.hash = tab ? `#/${pageOnly}?tab=${tab}` : `#/${pageOnly}`;
      }
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const page = getPageFromHash();
      setCurrentPage(page);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', handleHashChange);
      return () => window.removeEventListener('hashchange', handleHashChange);
    }
  }, []);

  const theme = getTheme(mode);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [statusRes, dataRes, configRes] = await Promise.all([
        fetch('/api/status').catch((e) => ({ ok: false, err: e })),
        fetch('/api/data').catch((e) => ({ ok: false, err: e })),
        fetch('/api/screener/config').catch((e) => ({ ok: false, err: e })),
      ]);

      if (statusRes.ok) {
        const sJson = await statusRes.json();
        setStatusData(sJson);
      }
      if (dataRes.ok) {
        const dJson = await dataRes.json();
        setDataPayload(dJson);
      }
      if (configRes.ok) {
        const cJson = await configRes.json();
        if (cJson.config) {
          setScreenerConfig(cJson.config);
          setConfigError(false);
        }
      } else if (configRes.status >= 400 || configRes.err) {
        setConfigError(true);
      }
    } catch (err) {
      console.warn('[Dashboard] Data fetch error:', err);
    } finally {
      setLoading(false);
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  useEffect(() => {
    const handleConfigUpdate = () => {
      fetchDashboardData();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('screener-config-updated', handleConfigUpdate);
      return () => window.removeEventListener('screener-config-updated', handleConfigUpdate);
    }
  }, [fetchDashboardData]);

  const user = statusData?.user || dataPayload?.user || 'jefri';

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'agents':
        return <AgentsPage screenerConfig={screenerConfig} />;
      case 'opend':
        return <OpendPage statusData={statusData} onRefresh={fetchDashboardData} />;
      case 'l0':
      case 'funnel':
      case 'watchlist':
        return (
          <L0Page
            dataPayload={dataPayload}
            screenerConfig={screenerConfig}
            configLoading={configLoading}
            configError={configError}
          />
        );
      case 'settings':
        return <SettingsPage statusData={statusData} onRefresh={fetchDashboardData} />;
      case 'quota':
        return <QuotaPage />;
      case 'overview':
      default:
        return (
          <OverviewPage
            statusData={statusData}
            dataPayload={dataPayload}
            onNavigate={navigateTo}
          />
        );
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <Layout
          currentPage={currentPage}
          onNavigate={navigateTo}
          currentMode={mode}
          onToggleMode={toggleMode}
          user={user}
          statusData={statusData}
        >
          {loading && !statusData ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                py: 10,
              }}
            >
              <CircularProgress size={40} color="primary" />
              <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
                Memuatkan metrik papan pemuka...
              </Typography>
            </Box>
          ) : (
            renderCurrentPage()
          )}
        </Layout>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
