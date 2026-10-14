import { createTheme } from '@mui/material/styles';

// Shared look: Inter, blue primary, light grey page, 8px spacing, dark-blue AppBar.
const theme = createTheme({
  spacing: 8,
  palette: {
    primary: { main: '#1565C0', dark: '#0D47A1', light: '#E3EEFA' },
    background: { default: '#F7F8FA', paper: '#FFFFFF' },
    text: { primary: '#1F2937', secondary: '#4B5563' },
    divider: '#E3E6EB',
  },
  typography: { fontFamily: 'Inter, system-ui, sans-serif', body1: { fontSize: '1rem' } },
  components: {
    MuiAppBar: {
      defaultProps: { position: 'static' },
      styleOverrides: { root: { backgroundColor: '#1565C0', boxShadow: '0 2px 4px rgba(0,0,0,.18)' } },
    },
  },
});

export default theme;
