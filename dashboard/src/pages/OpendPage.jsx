import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Paper,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import RouterIcon from '@mui/icons-material/Router';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { sneatTokens } from '../theme';
import { OpendControlPanel } from '../components/OpendControlPanel';

export function OpendPage({ statusData, onRefresh }) {
  const bridge = statusData?.bridge || {};
  const opendStatus = bridge.opend_status || bridge.status || 'UNKNOWN';
  const activeAcc = bridge.active_acc_id || (bridge.accounts && bridge.accounts[0]?.acc_id) || 'N/A';
  const accountsCount = (bridge.accounts || []).length;

  const isConnected = String(opendStatus).toUpperCase().includes('CONNECT') &&
    !String(opendStatus).toUpperCase().includes('ERROR') &&
    !String(opendStatus).toUpperCase().includes('DISCONNECT');

  return (
    <Box id="page-opend" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TuneIcon sx={{ color: sneatTokens.warning.main }} />
            Pengurusan Gerbang OpenD &amp; Sesi Dagangan
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Kawalan sesi broker Moomoo, pertukaran akaun pantas, log masuk kredensial selamat, dan geganti 2FA OTP (Seksyen 3.5.B Blueprint).
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            size="small"
            icon={isConnected ? <CheckCircleIcon sx={{ fontSize: '14px !important' }} /> : <WarningAmberIcon sx={{ fontSize: '14px !important' }} />}
            label={`Sesi: ${opendStatus}`}
            sx={{
              fontWeight: 700,
              backgroundColor: isConnected ? sneatTokens.success.soft : sneatTokens.warning.soft,
              color: isConnected ? sneatTokens.success.main : sneatTokens.warning.main,
            }}
          />
          <Chip
            size="small"
            label={`Akaun Aktif: ${activeAcc}`}
            sx={{
              fontWeight: 600,
              backgroundColor: sneatTokens.secondary.soft,
              color: sneatTokens.secondary.main,
            }}
          />
        </Box>
      </Box>

      {/* Connection & Architecture Diagnostic Banner */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: '8px',
          border: (t) => `1px solid ${t.palette.divider}`,
          backgroundColor: 'background.paper',
        }}
      >
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <RouterIcon sx={{ color: sneatTokens.info.main, fontSize: 20 }} />
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  Protokol Komunikasi
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  OpenD Telnet (Port 22222)
                </Typography>
              </Box>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              Bilangan Akaun Tersedia
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {accountsCount} Akaun Dikonfigurasi
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              Keselamatan Kata Laluan
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, color: sneatTokens.success.main }}>
              MD5 Server Hashing (Aktif)
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              Sokongan 2FA
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, color: sneatTokens.warning.main }}>
              Relay Kod OTP Automatik
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      {/* Main OpenD Interactive Control Panel */}
      <OpendControlPanel statusData={statusData} onRefresh={onRefresh} />
    </Box>
  );
}
