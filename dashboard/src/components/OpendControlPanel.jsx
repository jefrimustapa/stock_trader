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
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import LoginIcon from '@mui/icons-material/Login';
import KeyIcon from '@mui/icons-material/Key';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LockResetIcon from '@mui/icons-material/LockReset';
import RouterIcon from '@mui/icons-material/Router';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import SecurityIcon from '@mui/icons-material/Security';
import ShieldIcon from '@mui/icons-material/Shield';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { sneatTokens } from '../theme';

export function OpendControlPanel({ statusData, onRefresh }) {
  const bridge = statusData?.bridge || {};
  const opendStatus = bridge.opend_status || bridge.status || 'UNKNOWN';

  const isConnected = String(opendStatus).toUpperCase().includes('CONNECT') &&
    !String(opendStatus).toUpperCase().includes('ERROR') &&
    !String(opendStatus).toUpperCase().includes('DISCONNECT');

  // Helper functions to safely extract string ID and display label from account objects/strings
  const extractAccId = (a) => {
    if (!a) return '';
    if (typeof a === 'string' || typeof a === 'number') return String(a);
    return String(a.account_id || a.acc_id || a.id || '');
  };

  const extractAccLabel = (a) => {
    if (!a) return '';
    if (typeof a === 'string' || typeof a === 'number') return String(a);
    const id = extractAccId(a);
    const env = a.trd_env || a.acc_type || a.sim_acc_type || '';
    const label = a.label || '';
    if (label) return `${label} (${id})`;
    if (env && env !== 'N/A') return `${id} (${env})`;
    return id;
  };

  const initialAccs = bridge.account_info?.available_accounts || bridge.available_accounts || bridge.accounts || [];
  const initialActiveId = extractAccId(bridge.account_id || bridge.active_acc_id || initialAccs[0]);

  // Accounts state
  const [accounts, setAccounts] = useState(initialAccs);
  const [selectedAccount, setSelectedAccount] = useState(initialActiveId);
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
  const [manualShowLogin, setManualShowLogin] = useState(false);

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
            const activeId = extractAccId(data.current_account_id || data.active_acc_id);
            if (activeId) {
              setSelectedAccount(activeId);
            } else if (!selectedAccount && data.accounts.length > 0) {
              setSelectedAccount(extractAccId(data.accounts[0]));
            }
          }
        }
      } catch (err) {
        // silent fail
      }
    }
    fetchAccounts();
  }, []);

  // Update accounts when statusData updates
  useEffect(() => {
    const liveAccs = bridge.account_info?.available_accounts || bridge.available_accounts || bridge.accounts;
    if (Array.isArray(liveAccs) && liveAccs.length > 0) {
      setAccounts(liveAccs);
    }
    const liveActiveId = extractAccId(bridge.account_id || bridge.active_acc_id);
    if (liveActiveId && !selectedAccount) {
      setSelectedAccount(liveActiveId);
    }
  }, [bridge.account_id, bridge.active_acc_id, bridge.account_info]);

  // Automatically trigger OTP dialog if OpenD is in WAIT_OTP state
  useEffect(() => {
    if (opendStatus === 'WAIT_OTP') {
      setOpenOtpDialog(true);
    }
  }, [opendStatus]);

  // Handle Account Switch
  const handleSwitchAccount = async (accId) => {
    if (!accId) return;
    const targetId = extractAccId(accId);
    setSelectedAccount(targetId);
    setSwitchingAcc(true);
    setAccMessage(null);
    try {
      const resp = await fetch('/api/opend/switch-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: targetId }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setAccMessage({ type: 'success', text: `Account switched to ${targetId}` });
        if (onRefresh) onRefresh();
      } else {
        setAccMessage({ type: 'error', text: data.error || 'Failed to switch trading account.' });
      }
    } catch (err) {
      setAccMessage({ type: 'error', text: `Network error: ${err.message}` });
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
        setSignOutMessage({ type: 'success', text: 'OpenD session ended successfully.' });
        setOpenSignOutDialog(false);
        setManualShowLogin(false);
        if (onRefresh) onRefresh();
      } else {
        setSignOutMessage({ type: 'error', text: data.error || 'Failed to end OpenD session.' });
      }
    } catch (err) {
      setSignOutMessage({ type: 'error', text: `Error: ${err.message}` });
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
      setSignInMessage({ type: 'error', text: 'Enter Account ID and password.' });
      return;
    }
    setSigningIn(true);
    setSignInMessage({ type: 'info', text: 'Connecting to OpenD Telnet gateway...' });
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
          setSignInMessage({ type: 'warning', text: 'Credentials verified. 2FA OTP code required.' });
          setOpenOtpDialog(true);
        } else if (data.status === 'CONNECTED') {
          setSignInMessage({ type: 'success', text: 'Sign-in successful. OpenD status is CONNECTED.' });
          setManualShowLogin(false);
          if (onRefresh) onRefresh();
        } else {
          setSignInMessage({ type: 'info', text: data.message || `Status updated: ${data.status}` });
          if (onRefresh) onRefresh();
        }
      } else {
        setSignInMessage({ type: 'error', text: data.error || data.detail || 'Sign-in failed.' });
      }
    } catch (err) {
      setSignInMessage({ type: 'error', text: `Error: ${err.message}` });
    } finally {
      setSigningIn(false);
    }
  };

  // Handle OTP Submission
  const handleSubmitOtp = async (e) => {
    if (e) e.preventDefault();
    if (!otpCode) {
      setOtpMessage({ type: 'error', text: 'Enter OTP code.' });
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
        setOtpMessage({ type: 'success', text: 'OTP code received. Authenticating...' });
        setOtpCode('');
        setTimeout(() => {
          setOpenOtpDialog(false);
          setManualShowLogin(false);
          if (onRefresh) onRefresh();
        }, 1200);
      } else {
        setOtpMessage({ type: 'error', text: data.error || 'OTP verification failed.' });
      }
    } catch (err) {
      setOtpMessage({ type: 'error', text: `Error: ${err.message}` });
    } finally {
      setSubmittingOtp(false);
    }
  };

  return (
    <Box id="opend-control" sx={{ mb: 4 }}>
      <Grid container spacing={3}>
        {/* Kolum Utama: Sesi Broker & Kawalan Akaun */}
        <Grid item xs={12}>
          {isConnected && !manualShowLogin ? (
            /* Keadaan 1: Terhubung (Connected) -> Hanya tunjuk Logout & Pertukaran Akaun. Sembunyikan Borang Login */
            <Card sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}>
              <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5, flexWrap: 'wrap', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: '8px',
                        backgroundColor: sneatTokens.success.soft,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: sneatTokens.success.main,
                      }}
                    >
                      <CheckCircleIcon sx={{ fontSize: 26 }} />
                    </Box>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 600, fontSize: { xs: '1rem', sm: '1.15rem' } }}>
                        Active &amp; Connected Moomoo Broker Session
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        OpenD gateway is ready for live market feeds and order execution.
                      </Typography>
                    </Box>
                  </Box>
                  <Chip
                    icon={<CheckCircleIcon sx={{ fontSize: '15px !important' }} />}
                    label={opendStatus}
                    sx={{
                      fontWeight: 700,
                      backgroundColor: sneatTokens.success.soft,
                      color: sneatTokens.success.main,
                    }}
                  />
                </Box>

                {accMessage && (
                  <Alert severity={accMessage.type} sx={{ mb: 2, borderRadius: '8px' }}>
                    {accMessage.text}
                  </Alert>
                )}

                {signOutMessage && (
                  <Alert severity={signOutMessage.type} sx={{ mb: 2, borderRadius: '8px' }}>
                    {signOutMessage.text}
                  </Alert>
                )}

                <Box sx={{ mb: 3, mt: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
                    Fast Trading Account Switch
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.5 }}>
                    Select Paper Trading (SIMULATE) or Margin (REAL) dynamically without restarting OpenD.
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="acc-select-label">Select Active Account (acc_id)</InputLabel>
                      <Select
                        labelId="acc-select-label"
                        id="accSelect"
                        value={selectedAccount || (accounts.length > 0 ? extractAccId(accounts[0]) : '')}
                        label="Select Active Account (acc_id)"
                        disabled={switchingAcc}
                        onChange={(e) => handleSwitchAccount(e.target.value)}
                      >
                        {accounts.length > 0 ? (
                          accounts.map((acc, idx) => {
                            const accId = extractAccId(acc);
                            const accLabel = extractAccLabel(acc);
                            return (
                              <MenuItem key={accId || idx} value={accId}>
                                {accLabel}
                              </MenuItem>
                            );
                          })
                        ) : (
                          <MenuItem value={selectedAccount || 'SIMULATE-1'}>
                            {selectedAccount || 'SIMULATE-1 (Active Account)'}
                          </MenuItem>
                        )}
                      </Select>
                    </FormControl>
                    {switchingAcc && <CircularProgress size={24} />}
                  </Box>
                </Box>

                <Divider sx={{ my: 2.5 }} />

                {/* Kawalan Logout (Hanya dipaparkan bila CONNECTED) */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                      End Current Session
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Clears session token file and sets Telnet gateway to idle mode.
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button
                      id="btnSignOut"
                      variant="outlined"
                      color="error"
                      startIcon={<PowerSettingsNewIcon />}
                      onClick={() => setOpenSignOutDialog(true)}
                      disabled={signingOut}
                      size="medium"
                    >
                      Sign Out OpenD Session
                    </Button>

                    <Button
                      variant="text"
                      size="small"
                      startIcon={<LockResetIcon />}
                      onClick={() => setManualShowLogin(true)}
                      sx={{ color: 'text.secondary', textTransform: 'none' }}
                    >
                      Change Moomoo Credentials
                    </Button>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ) : (
            /* Keadaan 2: Belum Login / Disconnected / Tukar Kredensial -> Tunjukkan Borang Login, Sembunyikan Logout */
            <Card sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}>
              <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: '8px',
                        backgroundColor: sneatTokens.primary.soft,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: sneatTokens.primary.main,
                      }}
                    >
                      <LoginIcon sx={{ fontSize: 26 }} />
                    </Box>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 600, fontSize: { xs: '1rem', sm: '1.15rem' } }}>
                        Moomoo Sign-In &amp; Credentials
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Enter Moomoo account ID and password to start OpenD session.
                      </Typography>
                    </Box>
                  </Box>
                  <Chip
                    icon={<WarningAmberIcon sx={{ fontSize: '15px !important' }} />}
                    label={opendStatus}
                    sx={{
                      fontWeight: 700,
                      backgroundColor: sneatTokens.warning.soft,
                      color: sneatTokens.warning.main,
                    }}
                  />
                </Box>

                {signInMessage && (
                  <Alert severity={signInMessage.type} sx={{ mb: 2, borderRadius: '8px' }}>
                    {signInMessage.text}
                  </Alert>
                )}

                <Box component="form" onSubmit={handleOpenDSignIn} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1.5 }}>
                  <TextField
                    id="loginAccInput"
                    name="username"
                    label="Moomoo Account ID / Email"
                    variant="outlined"
                    size="small"
                    fullWidth
                    autoComplete="username"
                    value={loginAcc}
                    onChange={(e) => setLoginAcc(e.target.value)}
                    placeholder="e.g. 12345678"
                    required
                    inputProps={{
                      autoComplete: 'username',
                    }}
                  />

                  <TextField
                    id="loginPwdInput"
                    name="password"
                    label="Moomoo Password"
                    type={showPassword ? 'text' : 'password'}
                    variant="outlined"
                    size="small"
                    fullWidth
                    autoComplete="current-password"
                    value={loginPwd}
                    onChange={(e) => setLoginPwd(e.target.value)}
                    placeholder="Account password"
                    required
                    inputProps={{
                      autoComplete: 'current-password',
                    }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            aria-label="show or hide password"
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

                  <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 1 }}>
                    <Button
                      type="submit"
                      variant="contained"
                      color="primary"
                      startIcon={signingIn ? <CircularProgress size={18} color="inherit" /> : <LoginIcon />}
                      disabled={signingIn}
                      sx={{ flex: 1 }}
                    >
                      {signingIn ? 'Sending Credentials...' : 'Sign In to OpenD'}
                    </Button>

                    {isConnected && manualShowLogin && (
                      <Button
                        variant="outlined"
                        color="secondary"
                        onClick={() => setManualShowLogin(false)}
                      >
                        Cancel
                      </Button>
                    )}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      {/* Dialog Pengesahan Sign-Out */}
      <Dialog open={openSignOutDialog} onClose={() => setOpenSignOutDialog(false)}>
        <DialogTitle sx={{ fontWeight: 600 }}>Confirm OpenD Session Termination</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to end this OpenD session? Live market data and order execution will pause until you sign in again.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenSignOutDialog(false)} color="secondary">
            Cancel
          </Button>
          <Button
            onClick={handleOpenDSignOut}
            variant="contained"
            color="error"
            disabled={signingOut}
          >
            {signingOut ? 'Ending Session...' : 'Sign Out Now'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Masukan Kod 2FA OTP (Hanya dipaparkan secara popup bila WAIT_OTP atau semasa log masuk) */}
      <Dialog open={openOtpDialog} onClose={() => setOpenOtpDialog(false)}>
        <DialogTitle sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
          <KeyIcon sx={{ color: sneatTokens.warning.main }} /> Enter 2FA OTP Verification Code
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Check SMS or your Moomoo device and enter the 4-8 digit OTP code to complete broker authentication.
          </DialogContentText>

          {otpMessage && (
            <Alert severity={otpMessage.type} sx={{ mb: 2, borderRadius: '8px' }}>
              {otpMessage.text}
            </Alert>
          )}

          <TextField
            id="otpInput"
            autoFocus
            label="2FA OTP Code (4-8 Digits)"
            fullWidth
            size="small"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            placeholder="e.g. 123456"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenOtpDialog(false)} color="secondary">
            Close
          </Button>
          <Button
            onClick={handleSubmitOtp}
            variant="contained"
            color="primary"
            disabled={submittingOtp}
          >
            {submittingOtp ? 'Verifying...' : 'Submit OTP Code'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
