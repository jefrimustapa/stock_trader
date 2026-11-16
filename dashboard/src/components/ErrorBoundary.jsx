import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
          <Paper sx={{ p: 4, maxWidth: 600, textAlign: 'center', border: '1px solid #FF3E1D' }}>
            <Typography variant="h5" color="error" gutterBottom sx={{ fontWeight: 600 }}>
              Ralat Pemaparan Komponen
            </Typography>
            <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
              {this.state.error?.message || 'Ralat tidak dijangka berlaku semasa rendering UI.'}
            </Typography>
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
            >
              Muat Semula Halaman
            </Button>
          </Paper>
        </Box>
      );
    }
    return this.props.children;
  }
}
