import React from 'react';
import {
  Box,
  Typography,
  Chip,
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { sneatTokens } from '../theme';
import { OpendControlPanel } from '../components/OpendControlPanel';

export function OpendPage({ statusData, onRefresh }) {
  const bridge = statusData?.bridge || {};
  const opendStatus = bridge.opend_status || bridge.status || 'UNKNOWN';
  const availableAccs = bridge.account_info?.available_accounts || bridge.available_accounts || bridge.accounts || [];
  const activeAcc = String(bridge.account_id || bridge.active_acc_id || availableAccs[0]?.account_id || availableAccs[0]?.acc_id || 'N/A');

  const isConnected = String(opendStatus).toUpperCase().includes('CONNECT') &&
    !String(opendStatus).toUpperCase().includes('ERROR') &&
    !String(opendStatus).toUpperCase().includes('DISCONNECT');

  return (
    <Box id="page-opend" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
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
            <TuneIcon sx={{ color: sneatTokens.warning.main }} />
            Pengurusan Gerbang OpenD &amp; Sesi Dagangan
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
            Kawalan sesi broker Moomoo, pertukaran akaun pantas, log masuk kredensial selamat, dan 2FA OTP (Seksyen 3.5.B Blueprint).
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
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

      {/* Main OpenD Interactive Control Panel & Gateway Diagnostics */}
      <OpendControlPanel statusData={statusData} onRefresh={onRefresh} />
    </Box>
  );
}
