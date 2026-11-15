import React, { useState, useEffect, useCallback } from 'react';
import { ThemeProvider, CssBaseline, Box, CircularProgress, Typography } from '@mui/material';
import { getTheme } from './theme';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { OverviewPage } from './pages/OverviewPage';
import { OpendPage } from './pages/OpendPage';
import { FunnelPage } from './pages/FunnelPage';
import { WatchlistPage } from './pages/WatchlistPage';

const VALID_PAGES = ['overview', 'opend', 'funnel', 'watchlist'];

export function App() {
  const [mode, setMode] = useState(() => {
    return (typeof localStorage !== 'undefined' && localStorage.getItem('stock_trader_theme_mode')) || 'dark';
  });

  const getPageFromHash = () => {
    if (typeof window === 'undefined') return 'overview';
    const cleanHash = (window.location.hash || '').replace(/^#\/?/, '').trim().toLowerCase();
    return VALID_PAGES.includes(cleanHash) ? cleanHash : 'overview';
  };

  const [currentPage, setCurrentPage] = useState(getPageFromHash);
  const [statusData, setStatusData] = useState(null);
  const [dataPayload, setDataPayload] = useState(null);
  const [loading, setLoading] = useState(true);

  const toggleMode = () => {
    const nextMode = mode === 'dark' ? 'light' : 'dark';
    setMode(nextMode);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('stock_trader_theme_mode', nextMode);
    }
  };

  const navigateTo = (pageId) => {
    if (VALID_PAGES.includes(pageId)) {
      setCurrentPage(pageId);
      if (typeof window !== 'undefined') {
        window.location.hash = `#/${pageId}`;
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
      const [statusRes, dataRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/data'),
      ]);

      if (statusRes.ok) {
        const sJson = await statusRes.json();
        setStatusData(sJson);
      }
      if (dataRes.ok) {
        const dJson = await dataRes.json();
        setDataPayload(dJson);
      }
    } catch (err) {
      console.warn('[Dashboard] Data fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const user = statusData?.user || dataPayload?.user || 'jefri';

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'opend':
        return <OpendPage statusData={statusData} onRefresh={fetchDashboardData} />;
      case 'funnel':
        return <FunnelPage dataPayload={dataPayload} />;
      case 'watchlist':
        return <WatchlistPage dataPayload={dataPayload} />;
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
