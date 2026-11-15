import React, { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Container,
  Paper,
  Divider,
  Button,
  useTheme,
  Tooltip,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import TuneIcon from '@mui/icons-material/Tune';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import ViewListIcon from '@mui/icons-material/ViewList';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import SecurityIcon from '@mui/icons-material/Security';
import { sneatTokens } from '../theme';

const SIDEBAR_WIDTH = 260;

export const navItems = [
  { id: 'overview', label: 'Ringkasan & Metrik', shortLabel: 'Ringkasan', subtitle: 'KPI & Status Sistem', icon: <DashboardIcon sx={{ fontSize: 20 }} /> },
  { id: 'opend', label: 'Pengurusan OpenD', shortLabel: 'OpenD', subtitle: 'Akaun & Kredensial', icon: <TuneIcon sx={{ fontSize: 20 }} /> },
  { id: 'funnel', label: 'Corong Saringan', shortLabel: 'Corong', subtitle: '5-Stage Screener', icon: <FilterAltIcon sx={{ fontSize: 20 }} /> },
  { id: 'watchlist', label: 'Watchlist Dwi-Lorong', shortLabel: 'Watchlist', subtitle: 'Momentum & Setup', icon: <ViewListIcon sx={{ fontSize: 20 }} /> },
];

export function Layout({
  currentPage = 'overview',
  onNavigate,
  currentMode,
  onToggleMode,
  user,
  statusData,
  children,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleItemClick = (id) => {
    if (onNavigate) {
      onNavigate(id);
    }
    setMobileOpen(false);
  };

  const opendStatus = statusData?.bridge?.opend_status || statusData?.bridge?.status || 'UNKNOWN';

  const getStatusChip = (st) => {
    const s = String(st).toUpperCase();
    if (s.includes('CONNECT') && !s.includes('ERROR') && !s.includes('DISCONNECT')) {
      return {
        label: 'CONNECTED',
        color: 'success',
        bg: sneatTokens.success.soft,
        text: sneatTokens.success.main,
      };
    }
    if (s.includes('OTP') || s.includes('LOGIN')) {
      return {
        label: s,
        color: 'warning',
        bg: sneatTokens.warning.soft,
        text: sneatTokens.warning.main,
      };
    }
    if (s.includes('ERROR') || s.includes('UNREACHABLE') || s.includes('FAIL')) {
      return {
        label: s,
        color: 'error',
        bg: sneatTokens.error.soft,
        text: sneatTokens.error.main,
      };
    }
    return {
      label: s,
      color: 'default',
      bg: sneatTokens.secondary.soft,
      text: sneatTokens.secondary.main,
    };
  };

  const statusChip = getStatusChip(opendStatus);

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Brand Header */}
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: '8px',
            backgroundColor: sneatTokens.primary.main,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            boxShadow: '0 2px 6px 0 rgba(105, 108, 255, 0.4)',
          }}
        >
          <ShowChartIcon sx={{ fontSize: 22 }} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            Stock Trader
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            US Equity Automation
          </Typography>
        </Box>
      </Box>

      <Divider />

      {/* Nav List */}
      <List sx={{ px: 1.5, py: 2, flex: 1 }}>
        {navItems.map((item) => {
          const isActive = currentPage === item.id;
          return (
            <ListItem key={item.id} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                id={`nav-item-${item.id}`}
                onClick={() => handleItemClick(item.id)}
                sx={{
                  borderRadius: '8px',
                  py: 1.2,
                  px: 1.8,
                  backgroundColor: isActive ? sneatTokens.primary.soft : 'transparent',
                  color: isActive ? sneatTokens.primary.main : 'text.primary',
                  '&:hover': {
                    backgroundColor: isActive ? sneatTokens.primary.soft : 'action.hover',
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 36,
                    color: isActive ? sneatTokens.primary.main : 'text.secondary',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  secondary={item.subtitle}
                  primaryTypographyProps={{
                    fontSize: '0.875rem',
                    fontWeight: isActive ? 600 : 500,
                  }}
                  secondaryTypographyProps={{
                    fontSize: '0.72rem',
                    color: isActive ? sneatTokens.primary.main : 'text.secondary',
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      {/* Security Status Box at Footer */}
      <Box sx={{ p: 2 }}>
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: '8px',
            backgroundColor: theme.palette.mode === 'dark' ? '#323249' : '#F5F5F9',
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <SecurityIcon sx={{ fontSize: 16, color: sneatTokens.success.main }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              Authentik RS256 Active
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.7rem' }}>
            Forward-Auth Protected
          </Typography>
        </Paper>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'background.default' }}>
      {/* Responsive Navigation Sidebars */}
      <Box
        component="nav"
        sx={{ width: { md: SIDEBAR_WIDTH }, flexShrink: { md: 0 } }}
        aria-label="papan navigasi utama"
      >
        {/* Mobile temporary drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: SIDEBAR_WIDTH,
              backgroundColor: 'background.paper',
            },
          }}
        >
          {drawerContent}
        </Drawer>

        {/* Desktop permanent drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: SIDEBAR_WIDTH,
              borderRight: `1px solid ${theme.palette.divider}`,
              backgroundColor: 'background.paper',
            },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* Main Content Area */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top Header / AppBar */}
        <Paper
          elevation={0}
          sx={{
            py: 1.2,
            px: { xs: 1.5, sm: 3 },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${theme.palette.divider}`,
            position: 'sticky',
            top: 0,
            zIndex: 1100,
            borderRadius: 0,
            backdropFilter: 'blur(8px)',
            backgroundColor: theme.palette.mode === 'dark' ? 'rgba(43, 44, 64, 0.85)' : 'rgba(255, 255, 255, 0.85)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton
              onClick={handleDrawerToggle}
              edge="start"
              size="small"
              id="btn-mobile-menu"
              sx={{ display: { md: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, display: { xs: 'none', sm: 'block' } }}>
              Dashboard Kawalan &amp; Dagangan Saham US
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 } }}>
            {/* OpenD Status Chip */}
            <Chip
              size="small"
              id="chip-opend-status"
              label={`OpenD: ${statusChip.label}`}
              sx={{
                backgroundColor: statusChip.bg,
                color: statusChip.text,
                fontWeight: 600,
                fontSize: '0.75rem',
              }}
            />

            {/* User Chip */}
            {user && (
              <Chip
                size="small"
                id="chip-user-info"
                label={typeof user === 'string' ? user : (user.username || user.email || 'Pengguna')}
                sx={{
                  backgroundColor: sneatTokens.primary.soft,
                  color: sneatTokens.primary.main,
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  display: { xs: 'none', sm: 'inline-flex' },
                }}
              />
            )}

            {/* Dark/Light Mode Switch */}
            <Tooltip title={currentMode === 'dark' ? 'Tukar ke Mod Cerah' : 'Tukar ke Mod Gelap'}>
              <IconButton onClick={onToggleMode} size="small" color="inherit" id="btn-theme-toggle">
                {currentMode === 'dark' ? (
                  <LightModeOutlinedIcon sx={{ fontSize: 20, color: '#FFAB00' }} />
                ) : (
                  <DarkModeOutlinedIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                )}
              </IconButton>
            </Tooltip>

            {/* Logout Button */}
            <Button
              id="btn-logout"
              variant="outlined"
              size="small"
              color="secondary"
              startIcon={<LogoutIcon sx={{ fontSize: 16 }} />}
              href="/logout"
              sx={{
                borderRadius: '8px',
                borderColor: theme.palette.divider,
                fontSize: '0.8rem',
                py: 0.5,
                px: { xs: 1, sm: 1.5 },
              }}
            >
              Log Keluar
            </Button>
          </Box>
        </Paper>

        {/* Responsive Mobile / Quick-Tab Page Navigation Bar */}
        <Paper
          elevation={0}
          id="page-tab-bar"
          sx={{
            px: { xs: 1.5, sm: 3 },
            py: 1,
            borderBottom: `1px solid ${theme.palette.divider}`,
            backgroundColor: theme.palette.mode === 'dark' ? '#27283c' : '#fcfcfd',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            overflowX: 'auto',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <Button
                key={item.id}
                id={`tab-btn-${item.id}`}
                variant={isActive ? 'contained' : 'text'}
                size="small"
                onClick={() => handleItemClick(item.id)}
                startIcon={item.icon}
                sx={{
                  borderRadius: '20px',
                  px: 2,
                  py: 0.5,
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  boxShadow: 'none',
                  backgroundColor: isActive ? sneatTokens.primary.main : 'transparent',
                  color: isActive ? '#ffffff' : 'text.secondary',
                  '&:hover': {
                    backgroundColor: isActive ? sneatTokens.primary.main : sneatTokens.primary.soft,
                    color: isActive ? '#ffffff' : sneatTokens.primary.main,
                    boxShadow: 'none',
                  },
                }}
              >
                {item.shortLabel || item.label}
              </Button>
            );
          })}
        </Paper>

        {/* Page Container */}
        <Container maxWidth="xl" sx={{ py: 3, px: { xs: 1.5, sm: 3 }, flexGrow: 1 }}>
          {children}
        </Container>
      </Box>
    </Box>
  );
}
