import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Grid,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
  CircularProgress,
  Divider,
  InputAdornment,
  IconButton,
} from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import LoginIcon from '@mui/icons-material/Login';
import KeyIcon from '@mui/icons-material/Key';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { sneatTokens } from '../theme';

export function OpendControlPanel({ statusData, onRefresh }) {
  const bridge = statusData?.bridge || {};
  const opendStatus = bridge.opend_status || bridge.status || 'UNKNOWN';

  // Accounts state
  const [accounts, setAccounts] = useState(bridge.accounts || []);
  const [selectedAccount, setSelectedAccount] = useState(bridge.active_acc_id || '');
  const [switchingAcc, setSwitchingAcc] = useState(false);
  const [accMessage, setAccMessage] = useState(null);

  // Sign out state
  const [openSignOutDialog, setOpenSignOutDialog] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutMessage, setSignOutMessage] = useState(null);

  // Sign in form state
  const [loginAcc, setLoginAcc] = useState('');
  const [loginPwd, setLoginPwd] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signInMessage, setSignInMessage] = useState(null);

  // OTP Dialog state
  const [openOtpDialog, setOpenOtpDialog] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [submittingOtp, setSubmittingOtp] = useState(false);
  const [otpMessage, setOtpMessage] = useState(null);

  // Fetch accounts list on load
  useEffect(() => {
    async function fetchAccounts() {
      try {
        const resp = await fetch('/api/opend/accounts');
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.accounts)) {
            setAccounts(data.accounts);
            if (!selectedAccount && data.active_acc_id) {
              setSelectedAccount(data.active_acc_id);
            }
          }
        }
      } catch (err) {
        // silent fail
      }
    }
    fetchAccounts();
  }, []);

  // Automatically trigger OTP dialog if OpenD is in WAIT_OTP state
  useEffect(() => {
    if (opendStatus === 'WAIT_OTP') {
      setOpenOtpDialog(true);
    }
  }, [opendStatus]);

  // Handle Account Switch
  const handleSwitchAccount = async (accId) => {
    if (!accId) return;
    setSelectedAccount(accId);
    setSwitchingAcc(true);
    setAccMessage(null);
    try {
      const resp = await fetch('/api/opend/switch-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accId }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setAccMessage({ type: 'success', text: `Akaun berjaya ditukar kepada ${accId}` });
        if (onRefresh) onRefresh();
      } else {
        setAccMessage({ type: 'error', text: data.error || 'Gagal menukar akaun dagangan.' });
      }
    } catch (err) {
      setAccMessage({ type: 'error', text: `Ralat rangkaian: ${err.message}` });
    } finally {
      setSwitchingAcc(false);
    }
  };

  // Handle OpenD Sign-Out
  const handleOpenDSignOut = async () => {
    setSigningOut(true);
    setSignOutMessage(null);
    try {
      const resp = await fetch('/api/opend/sign-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await resp.json();
      if (resp.ok) {
        setSignOutMessage({ type: 'success', text: 'Sesi OpenD berjaya ditamatkan.' });
        setOpenSignOutDialog(false);
        if (onRefresh) onRefresh();
      } else {
        setSignOutMessage({ type: 'error', text: data.error || 'Gagal menamatkan sesi OpenD.' });
      }
    } catch (err) {
      setSignOutMessage({ type: 'error', text: `Ralat: ${err.message}` });
    } finally {
      setSigningOut(false);
    }
  };

  // Handle Moomoo Sign-In
  const handleOpenDSignIn = async (e) => {
    if (e) e.preventDefault();
    const effectiveAcc = (loginAcc || document.getElementById('loginAccInput')?.value || '').trim();
    const effectivePwd = loginPwd || document.getElementById('loginPwdInput')?.value || '';

    if (!effectiveAcc || !effectivePwd) {
      setSignInMessage({ type: 'error', text: 'Sila lengkapkan Account ID dan kata laluan.' });
      return;
    }
    setSigningIn(true);
    setSignInMessage({ type: 'info', text: 'Menghubungi OpenD Telnet gateway...' });
    try {
      const resp = await fetch('/api/opend/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_account: effectiveAcc, password: effectivePwd }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setLoginPwd('');
        const pwdInputEl = document.getElementById('loginPwdInput');
        if (pwdInputEl) pwdInputEl.value = '';
        if (data.status === 'WAIT_OTP') {
          setSignInMessage({ type: 'warning', text: 'Kredensial disahkan! Kod OTP 2FA diperlukan.' });
          setOpenOtpDialog(true);
        } else if (data.status === 'CONNECTED') {
          setSignInMessage({ type: 'success', text: 'Log masuk berjaya! Status OpenD kini CONNECTED.' });
          if (onRefresh) onRefresh();
        } else {
          setSignInMessage({ type: 'info', text: data.message || `Status dikemas kini: ${data.status}` });
          if (onRefresh) onRefresh();
        }
      } else {
        setSignInMessage({ type: 'error', text: data.error || data.detail || 'Log masuk gagal.' });
      }
    } catch (err) {
      setSignInMessage({ type: 'error', text: `Ralat: ${err.message}` });
    } finally {
      setSigningIn(false);
    }
  };

  // Handle OTP Submission
  const handleSubmitOtp = async (e) => {
    if (e) e.preventDefault();
    if (!otpCode) {
      setOtpMessage({ type: 'error', text: 'Sila masukkan kod OTP.' });
      return;
    }
    setSubmittingOtp(true);
    setOtpMessage(null);
    try {
      const resp = await fetch('/api/telnet/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp_code: otpCode }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setOtpMessage({ type: 'success', text: 'Kod OTP diterima! Memulakan pengesahan...' });
        setOtpCode('');
        setTimeout(() => {
          setOpenOtpDialog(false);
          if (onRefresh) onRefresh();
        }, 1500);
      } else {
        setOtpMessage({ type: 'error', text: data.error || 'Pengesahan OTP gagal.' });
      }
    } catch (err) {
      setOtpMessage({ type: 'error', text: `Ralat: ${err.message}` });
    } finally {
      setSubmittingOtp(false);
    }
  };

  return (
    <Box id="opend-control" sx={{ mb: 4 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Pengurusan Akaun &amp; Sesi Dagangan OpenD
      </Typography>

      <Grid container spacing={2.5}>
        {/* Panel Kiri: Pertukaran Akaun & Kawalan Sesi */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <SwapHorizIcon color="primary" /> Pertukaran Akaun Dagangan Pantas
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                Pilih akaun dagangan Paper Trading (SIMULATE) atau REAL tanpa perlu memulakan semula (restart) kontena OpenD.
              </Typography>

              {accMessage && (
                <Alert severity={accMessage.type} sx={{ mb: 2, borderRadius: '8px' }}>
                  {accMessage.text}
                </Alert>
              )}

              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 4 }}>
                <FormControl fullWidth size="small">
                  <InputLabel id="acc-select-label">Pilih Akaun (acc_id)</InputLabel>
                  <Select
                    labelId="acc-select-label"
                    id="accSelect"
                    value={selectedAccount}
                    label="Pilih Akaun (acc_id)"
                    disabled={switchingAcc}
                    onChange={(e) => handleSwitchAccount(e.target.value)}
                  >
                    {accounts.length > 0 ? (
                      accounts.map((acc) => (
                        <MenuItem key={acc.acc_id || acc} value={acc.acc_id || acc}>
                          {acc.acc_id || acc} {acc.acc_type ? `(${acc.acc_type})` : ''}
                        </MenuItem>
                      ))
                    ) : (
                      <MenuItem value={selectedAccount || 'SIMULATE-1'}>
                        {selectedAccount || 'SIMULATE-1 (Akaun Aktif)'}
                      </MenuItem>
                    )}
                  </Select>
                </FormControl>
                {switchingAcc && <CircularProgress size={24} />}
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Sesi OpenD Sign Out */}
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                Penamatan Sesi Broker
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                Tamatkan sesi OpenD Telnet untuk membersihkan token cache dan mengembalikan gerbang ke mod idle.
              </Typography>

              {signOutMessage && (
                <Alert severity={signOutMessage.type} sx={{ mb: 2, borderRadius: '8px' }}>
                  {signOutMessage.text}
                </Alert>
              )}

              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  id="btnSignOut"
                  variant="outlined"
                  color="error"
                  startIcon={<PowerSettingsNewIcon />}
                  onClick={() => setOpenSignOutDialog(true)}
                  disabled={signingOut}
                >
                  Sign-Out Sesi OpenD
                </Button>

                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<KeyIcon />}
                  onClick={() => setOpenOtpDialog(true)}
                >
                  Geganti 2FA OTP
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Panel Kanan: Log Masuk Moomoo & Kredensial */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <LoginIcon color="primary" /> Log Masuk &amp; Kredensial Moomoo
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                Masukkan ID akaun dan kata laluan Moomoo. Kata laluan di-hash MD5 di peringkat pelayan untuk keselamatan mutlak.
              </Typography>

              {signInMessage && (
                <Alert severity={signInMessage.type} sx={{ mb: 2, borderRadius: '8px' }}>
                  {signInMessage.text}
                </Alert>
              )}

              <Box component="form" onSubmit={handleOpenDSignIn} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  id="loginAccInput"
                  name="username"
                  label="Moomoo Account ID / Emel"
                  variant="outlined"
                  size="small"
                  fullWidth
                  autoComplete="username"
                  value={loginAcc}
                  onChange={(e) => setLoginAcc(e.target.value)}
                  placeholder="cth. 12345678"
                  required
                  inputProps={{
                    autoComplete: 'username',
                  }}
                />

                <TextField
                  id="loginPwdInput"
                  name="password"
                  label="Kata Laluan Moomoo"
                  type={showPassword ? 'text' : 'password'}
                  variant="outlined"
                  size="small"
                  fullWidth
                  autoComplete="current-password"
                  value={loginPwd}
                  onChange={(e) => setLoginPwd(e.target.value)}
                  placeholder="Kata laluan akaun"
                  required
                  inputProps={{
                    autoComplete: 'current-password',
                  }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="papar atau sembunyikan kata laluan"
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          size="small"
                          tabIndex={-1}
                        >
                          {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />

                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  startIcon={signingIn ? <CircularProgress size={18} color="inherit" /> : <LoginIcon />}
                  disabled={signingIn}
                  sx={{ mt: 1 }}
                >
                  {signingIn ? 'Menghantar Kredensial...' : 'Log Masuk ke OpenD'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Dialog Pengesahan Sign-Out */}
      <Dialog open={openSignOutDialog} onClose={() => setOpenSignOutDialog(false)}>
        <DialogTitle sx={{ fontWeight: 600 }}>Sahkan Penamatan Sesi OpenD</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Adakah anda pasti mahu menamatkan sesi OpenD ini? Sambungan data langsung pasaran dan pelaksanaan pesanan akan digantung sehingga log masuk semula.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenSignOutDialog(false)} color="secondary">
            Batal
          </Button>
          <Button
            onClick={handleOpenDSignOut}
            variant="contained"
            color="error"
            disabled={signingOut}
          >
            {signingOut ? 'Sedang Ditamatkan...' : 'Ya, Sign-Out Sekarang'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Masukan Kod 2FA OTP */}
      <Dialog open={openOtpDialog} onClose={() => setOpenOtpDialog(false)}>
        <DialogTitle sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
          <KeyIcon sx={{ color: sneatTokens.warning.main }} /> Masukkan Kod Pengesahan 2FA OTP
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Sila semak mesej SMS atau peranti Moomoo anda dan masukkan kod OTP 4-8 digit untuk melengkapkan pengesahan Telnet broker.
          </DialogContentText>

          {otpMessage && (
            <Alert severity={otpMessage.type} sx={{ mb: 2, borderRadius: '8px' }}>
              {otpMessage.text}
            </Alert>
          )}

          <TextField
            id="otpInput"
            autoFocus
            label="Kod 2FA OTP (4-8 Digit)"
            fullWidth
            size="small"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            placeholder="cth. 123456"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenOtpDialog(false)} color="secondary">
            Tutup
          </Button>
          <Button
            onClick={handleSubmitOtp}
            variant="contained"
            color="primary"
            disabled={submittingOtp}
          >
            {submittingOtp ? 'Mengesahkan...' : 'Hantar Kod OTP'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
