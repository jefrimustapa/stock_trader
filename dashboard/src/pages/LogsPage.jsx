import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  ButtonGroup,
  TextField,
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Paper,
  FormControlLabel,
  Checkbox,
  InputAdornment,
  Divider,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import TerminalIcon from '@mui/icons-material/Terminal';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { sneatTokens } from '../theme';

const CONTAINERS = [
  { id: 'bridge', name: 'stock_mcp_bridge', label: 'Bridge (L1-L4)', desc: 'Agent Pipeline & Sentinel' },
  { id: 'daemon', name: 'stock_screener_daemon', label: 'Daemon (L0)', desc: 'Cloud Screener' },
  { id: 'dashboard', name: 'stock_trading_dashboard', label: 'Dashboard', desc: 'Web & API Proxy' },
  { id: 'opend', name: 'stock_moomoo_opend', label: 'OpenD', desc: 'Broker Gateway' },
];

const LOG_LEVELS = ['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG'];
const TAIL_OPTIONS = [50, 100, 250, 500, 1000];
const REFRESH_INTERVALS = [
  { label: 'Off', value: 0 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
];

export function LogsPage() {
  const [selectedContainer, setSelectedContainer] = useState('bridge');
  const [tailLimit, setTailLimit] = useState(100);
  const [logLevel, setLogLevel] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(5000);
  const [autoScroll, setAutoScroll] = useState(true);

  const [logs, setLogs] = useState([]);
  const [totalLines, setTotalLines] = useState(0);
  const [returnedLines, setReturnedLines] = useState(0);
  const [containerStatuses, setContainerStatuses] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [copied, setCopied] = useState(false);

  const consoleEndRef = useRef(null);
  const consoleContainerRef = useRef(null);

  // Fetch running containers status
  const fetchContainerStatuses = useCallback(async () => {
    try {
      const res = await fetch('/api/system/containers');
      if (res.ok) {
        const data = await res.json();
        const statusMap = {};
        (data.services || []).forEach((svc) => {
          statusMap[svc.id] = svc.status;
        });
        setContainerStatuses(statusMap);
      }
    } catch (e) {
      console.warn('[LogsPage] Container status fetch failed:', e);
    }
  }, []);

  // Fetch logs
  const fetchLogs = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        container: selectedContainer,
        tail: String(tailLimit),
        level: logLevel,
        search: searchTerm,
      });

      const res = await fetch(`/api/system/logs?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      setLogs(data.logs || []);
      setTotalLines(data.total_lines || 0);
      setReturnedLines(data.returned_lines || (data.logs || []).length);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[LogsPage] Log fetch failed:', err);
      setError(err.message || 'Failed to fetch logs from system container.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [selectedContainer, tailLimit, logLevel, searchTerm]);

  // Initial load & container status
  useEffect(() => {
    fetchContainerStatuses();
    const statusInterval = setInterval(fetchContainerStatuses, 30000);
    return () => clearInterval(statusInterval);
  }, [fetchContainerStatuses]);

  // Fetch on parameter change
  useEffect(() => {
    fetchLogs(false);
  }, [fetchLogs]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const interval = setInterval(() => {
      fetchLogs(true);
    }, autoRefreshInterval);
    return () => clearInterval(interval);
  }, [autoRefreshInterval, fetchLogs]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleCopyLogs = () => {
    const text = logs
      .map((l) => `${l.timestamp || ''} [${l.level}] ${l.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLevelColor = (level) => {
    switch (level) {
      case 'ERROR':
        return sneatTokens.error.main;
      case 'WARN':
      case 'WARNING':
        return sneatTokens.warning.main;
      case 'DEBUG':
        return sneatTokens.secondary.light;
      case 'INFO':
      default:
        return sneatTokens.info.main;
    }
  };

  const highlightMatch = (text, query) => {
    if (!query || !query.trim() || !text) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <span
          key={i}
          className="search-highlight"
          style={{
            backgroundColor: '#FFAB00',
            color: '#000000',
            fontWeight: 700,
            padding: '1px 3px',
            borderRadius: '2px',
          }}
        >
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  const renderMessageContent = (message, query, level) => {
    if (!message) return null;
    const parts = message.split(/(\[[^\]]+\])/g);
    return parts.map((chunk, idx) => {
      if (!chunk) return null;
      const isBracketTag = chunk.startsWith('[') && chunk.endsWith(']');
      if (isBracketTag) {
        return (
          <span
            key={idx}
            className="log-bracket-tag"
            style={{
              color: '#79c0ff',
              fontWeight: 700,
              backgroundColor: 'rgba(56, 139, 253, 0.15)',
              border: '1px solid rgba(56, 139, 253, 0.35)',
              borderRadius: '4px',
              padding: '1px 6px',
              marginRight: '6px',
              display: 'inline-block',
              fontSize: '0.75rem',
              letterSpacing: '0.02em',
            }}
          >
            {highlightMatch(chunk, query)}
          </span>
        );
      }
      return (
        <span key={idx}>
          {highlightMatch(chunk, query)}
        </span>
      );
    });
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <TerminalIcon sx={{ fontSize: 32, color: sneatTokens.primary.main }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Container Logs Viewer
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Real-time multi-service runtime logs with level filtering & search
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {lastUpdated && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Updated {lastUpdated.toLocaleTimeString()}
            </Typography>
          )}
          <Button
            variant="contained"
            size="small"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
            onClick={() => fetchLogs(false)}
            disabled={loading}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* Control Card */}
      <Card sx={{ mb: 3, borderRadius: 2 }}>
        <CardContent sx={{ p: 2.5 }}>
          {/* Container Selection Buttons */}
          <Box sx={{ mb: 2.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.secondary' }}>
              TARGET SERVICE CONTAINER:
            </Typography>
            <Grid container spacing={1.5}>
              {CONTAINERS.map((c) => {
                const isSelected = selectedContainer === c.id;
                const status = containerStatuses[c.id] || 'RUNNING';
                const isRunning = status.includes('RUNNING') || status.includes('UP');

                return (
                  <Grid item xs={12} sm={6} md={3} key={c.id}>
                    <Paper
                      elevation={isSelected ? 4 : 1}
                      onClick={() => setSelectedContainer(c.id)}
                      sx={{
                        p: 1.5,
                        cursor: 'pointer',
                        borderRadius: 2,
                        border: '2px solid',
                        borderColor: isSelected ? sneatTokens.primary.main : 'divider',
                        backgroundColor: isSelected ? sneatTokens.primary.soft : 'background.paper',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          borderColor: sneatTokens.primary.light,
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: isSelected ? sneatTokens.primary.main : 'text.primary' }}>
                          {c.label}
                        </Typography>
                        <Chip
                          size="small"
                          label={isRunning ? 'ACTIVE' : status}
                          sx={{
                            height: 20,
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            backgroundColor: isRunning ? sneatTokens.success.soft : sneatTokens.secondary.soft,
                            color: isRunning ? sneatTokens.success.main : sneatTokens.secondary.main,
                          }}
                        />
                      </Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontFamily: 'monospace' }}>
                        {c.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                        {c.desc}
                      </Typography>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Filtering Controls */}
          <Grid container spacing={2} alignItems="center">
            {/* Log Level Filter */}
            <Grid item xs={12} sm={6} md={3}>
              <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5, color: 'text.secondary' }}>
                LOG LEVEL FILTER:
              </Typography>
              <ButtonGroup size="small" variant="outlined" sx={{ width: '100%' }}>
                {LOG_LEVELS.map((lvl) => (
                  <Button
                    key={lvl}
                    onClick={() => setLogLevel(lvl)}
                    variant={logLevel === lvl ? 'contained' : 'outlined'}
                    sx={{
                      flex: 1,
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      py: 0.6,
                    }}
                  >
                    {lvl}
                  </Button>
                ))}
              </ButtonGroup>
            </Grid>

            {/* Keyword Search Input */}
            <Grid item xs={12} sm={6} md={4}>
              <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5, color: 'text.secondary' }}>
                KEYWORD SEARCH:
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder="Filter by keyword (e.g. Tariq, error, quota, order)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                  endAdornment: searchTerm ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearchTerm('')}>
                        <ClearIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                }}
              />
            </Grid>

            {/* Tail Lines */}
            <Grid item xs={6} sm={3} md={2}>
              <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5, color: 'text.secondary' }}>
                TAIL LINES:
              </Typography>
              <TextField
                select
                fullWidth
                size="small"
                value={tailLimit}
                onChange={(e) => setTailLimit(Number(e.target.value))}
              >
                {TAIL_OPTIONS.map((num) => (
                  <MenuItem key={num} value={num}>
                    {num} lines
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Auto Refresh */}
            <Grid item xs={6} sm={3} md={3}>
              <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5, color: 'text.secondary' }}>
                AUTO-REFRESH:
              </Typography>
              <ButtonGroup size="small" variant="outlined" sx={{ width: '100%' }}>
                {REFRESH_INTERVALS.map((intv) => (
                  <Button
                    key={intv.label}
                    onClick={() => setAutoRefreshInterval(intv.value)}
                    variant={autoRefreshInterval === intv.value ? 'contained' : 'outlined'}
                    sx={{
                      flex: 1,
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      py: 0.6,
                    }}
                  >
                    {intv.label}
                  </Button>
                ))}
              </ButtonGroup>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Error Banner */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={
          <Button color="inherit" size="small" onClick={() => fetchLogs(false)}>
            Retry
          </Button>
        }>
          {error}
        </Alert>
      )}

      {/* Terminal Console View */}
      <Card sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
        {/* Terminal Header Bar */}
        <Box
          sx={{
            px: 2,
            py: 1.2,
            backgroundColor: '#1E202E',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              <FiberManualRecordIcon sx={{ fontSize: 12, color: '#FF5F56' }} />
              <FiberManualRecordIcon sx={{ fontSize: 12, color: '#FFBD2E' }} />
              <FiberManualRecordIcon sx={{ fontSize: 12, color: '#27C93F' }} />
            </Box>
            <Typography variant="caption" sx={{ color: '#A1ACB8', fontFamily: 'monospace', fontWeight: 600, ml: 1 }}>
              {CONTAINERS.find((c) => c.id === selectedContainer)?.name || selectedContainer} &bull; {returnedLines} of {totalLines} lines displayed
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  sx={{ color: '#8592A3', '&.Mui-checked': { color: sneatTokens.primary.main } }}
                />
              }
              label={
                <Typography variant="caption" sx={{ color: '#A1ACB8', fontSize: '0.75rem' }}>
                  Auto-scroll
                </Typography>
              }
              sx={{ mr: 1 }}
            />
            <Tooltip title={copied ? 'Copied to clipboard!' : 'Copy all logs'}>
              <IconButton size="small" onClick={handleCopyLogs} sx={{ color: '#A1ACB8' }}>
                {copied ? <CheckCircleOutlineIcon sx={{ fontSize: 18, color: sneatTokens.success.main }} /> : <ContentCopyIcon sx={{ fontSize: 18 }} />}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Terminal Content Body */}
        <Box
          ref={consoleContainerRef}
          sx={{
            p: 2,
            backgroundColor: '#0D1117',
            color: '#E6EDF3',
            fontFamily: '"Fira Code", "Roboto Mono", Consolas, monospace',
            fontSize: '0.8rem',
            lineHeight: 1.6,
            minHeight: 480,
            maxHeight: 700,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {loading && logs.length === 0 ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400, gap: 1.5 }}>
              <CircularProgress size={24} sx={{ color: sneatTokens.primary.main }} />
              <Typography variant="body2" sx={{ color: '#8B949E' }}>
                Streaming logs from {selectedContainer}...
              </Typography>
            </Box>
          ) : logs.length === 0 ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
              <Typography variant="body2" sx={{ color: '#8B949E' }}>
                No log entries matched your filter criteria.
              </Typography>
            </Box>
          ) : (
            logs.map((item, index) => {
              const levelColor = getLevelColor(item.level);

              return (
                <Box
                  key={index}
                  data-testid="log-row"
                  className="log-row"
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1.5,
                    py: 1,
                    px: 1.5,
                    my: 0.5,
                    borderRadius: '4px',
                    borderBottom: '1px solid #21262d',
                    borderLeft: '3px solid #388bfd',
                    backgroundColor: 'rgba(22, 27, 34, 0.6)',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      backgroundColor: 'rgba(56, 139, 253, 0.08)',
                    },
                  }}
                >
                  {/* Line Number */}
                  <Typography
                    component="span"
                    className="log-line-num"
                    sx={{
                      color: '#484F58',
                      fontSize: '0.75rem',
                      minWidth: 36,
                      textAlign: 'right',
                      userSelect: 'none',
                      pt: 0.1,
                    }}
                  >
                    {index + 1}
                  </Typography>

                  {/* Timestamp */}
                  {item.timestamp && (
                    <Typography
                      component="span"
                      className="log-timestamp"
                      sx={{
                        color: '#79c0ff',
                        fontSize: '0.75rem',
                        minWidth: 165,
                        fontFamily: 'monospace',
                        userSelect: 'none',
                        pt: 0.1,
                      }}
                    >
                      {item.timestamp.replace('T', ' ').substring(0, 19)}
                    </Typography>
                  )}

                  {/* Level Tag */}
                  <Typography
                    component="span"
                    className="log-level-tag"
                    sx={{
                      color: levelColor,
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      minWidth: 55,
                      userSelect: 'none',
                      pt: 0.1,
                    }}
                  >
                    [{item.level}]
                  </Typography>

                  {/* Stream Indicator (if stderr) */}
                  {item.stream === 'stderr' && (
                    <Typography
                      component="span"
                      className="log-stream-indicator"
                      sx={{
                        color: sneatTokens.warning.main,
                        fontSize: '0.7rem',
                        backgroundColor: 'rgba(255, 171, 0, 0.1)',
                        px: 0.5,
                        borderRadius: 0.5,
                        userSelect: 'none',
                        pt: 0.1,
                      }}
                    >
                      stderr
                    </Typography>
                  )}

                  {/* Log Message with bracket color coding & search highlight */}
                  <Typography
                    component="span"
                    className="log-message-content"
                    sx={{
                      flex: 1,
                      color: item.level === 'ERROR' ? '#FFA198' : '#C9D1D9',
                      wordBreak: 'break-word',
                    }}
                  >
                    {renderMessageContent(item.message, searchTerm, item.level)}
                  </Typography>
                </Box>
              );
            })
          )}
          <div ref={consoleEndRef} />
        </Box>
      </Card>
    </Box>
  );
}
