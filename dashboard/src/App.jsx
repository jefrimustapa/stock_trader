import React, { useState, useEffect, useCallback } from 'react';
import { ThemeProvider, CssBaseline, Box, CircularProgress, Typography } from '@mui/material';
import { getTheme } from './theme';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { KpiCards } from './components/KpiCards';
import { OpendControlPanel } from './components/OpendControlPanel';
import { FunnelStepper } from './components/FunnelStepper';
import { WatchlistTable } from './components/WatchlistTable';

export function App() {
  const [mode, setMode] = useState(() => {
    return localStorage.getItem('stock_trader_theme_mode') || 'dark';
  });

  const [statusData, setStatusData] = useState(null);
  const [dataPayload, setDataPayload] = useState(null);
  const [loading, setLoading] = useState(true);

  const toggleMode = () => {
    const nextMode = mode === 'dark' ? 'light' : 'dark';
    setMode(nextMode);
    localStorage.setItem('stock_trader_theme_mode', nextMode);
  };

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

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <Layout
          currentMode={mode}
          onToggleMode={toggleMode}
          user={user}
          statusData={statusData}
        >
          {loading && !statusData ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 10 }}>
              <CircularProgress size={40} color="primary" />
              <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
                Memuatkan metrik papan pemuka...
              </Typography>
            </Box>
          ) : (
            <>
              <KpiCards statusData={statusData} dataPayload={dataPayload} />
              <OpendControlPanel statusData={statusData} onRefresh={fetchDashboardData} />
              <FunnelStepper dataPayload={dataPayload} />
              <WatchlistTable dataPayload={dataPayload} />
            </>
          )}
        </Layout>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
