import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import { AppBar, Box, Button, IconButton, Menu, MenuItem, Toolbar, Typography, useMediaQuery } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

const DOCS = [
  { to: '/docs/general', label: 'General' },
  { to: '/docs/technical', label: 'Technical' },
  { to: '/docs/guide', label: 'Step-by-step guide' },
];

/** Page frame: dark AppBar with Projects link and Documentation menu; docs sub-bar only on /docs/*. */
export default function AppShell() {
  const { pathname } = useLocation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const narrow = useMediaQuery('(max-width:599.95px)');
  const inDocs = pathname.startsWith('/docs/');
  const navBtn = (active: boolean) => ({
    color: '#fff',
    height: '100%',
    borderRadius: 0,
    px: 2,
    fontWeight: 500,
    fontSize: 15,
    textTransform: 'none' as const,
    opacity: active ? 1 : 0.85,
    borderBottom: `3px solid ${active ? '#fff' : 'transparent'}`,
  });

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar>
        <Toolbar sx={{ maxWidth: 1440, width: '100%', mx: 'auto', gap: { xs: 1, sm: 4 }, height: 64, minWidth: 0, px: { xs: 2, md: 3 } }}>
          <Typography component={RouterLink} to="/" sx={{ color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 20, display: 'inline-flex', alignItems: 'center', minHeight: 44, minWidth: 44 }}>
            BNamericas
          </Typography>
          {narrow ? (
            <>
              <IconButton
                aria-label="Open menu"
                aria-haspopup="menu"
                aria-expanded={Boolean(anchor)}
                onClick={(e) => setAnchor(e.currentTarget)}
                sx={{ color: '#fff', ml: 'auto', width: 48, height: 48 }}
              >
                <MenuIcon />
              </IconButton>
              <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
                <MenuItem component={RouterLink} to="/" onClick={() => setAnchor(null)} sx={{ minHeight: 48 }}>Projects</MenuItem>
                <Typography variant="overline" sx={{ px: 2, color: 'text.secondary' }}>Documentation</Typography>
                {DOCS.map((d) => (
                  <MenuItem key={d.to} component={RouterLink} to={d.to} onClick={() => setAnchor(null)} sx={{ minHeight: 48, pl: 4 }}>
                    {d.label}
                  </MenuItem>
                ))}
              </Menu>
            </>
          ) : (
            <Box component="nav" aria-label="Main" sx={{ display: 'flex', gap: 1, height: '100%' }}>
              <Button component={RouterLink} to="/" sx={navBtn(!inDocs)}>Projects</Button>
              <Button
                aria-haspopup="menu"
                aria-expanded={Boolean(anchor)}
                endIcon={<ArrowDropDownIcon />}
                onClick={(e) => setAnchor(e.currentTarget)}
                sx={navBtn(inDocs)}
              >
                Documentation
              </Button>
              <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
                {DOCS.map((d) => (
                  <MenuItem key={d.to} component={RouterLink} to={d.to} onClick={() => setAnchor(null)}>
                    {d.label}
                  </MenuItem>
                ))}
              </Menu>
            </Box>
          )}
        </Toolbar>
      </AppBar>
      {inDocs && (
        <Box component="nav" aria-label="Documentation" sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ maxWidth: 1440, mx: 'auto', px: { xs: 1, md: 3 }, display: 'flex', gap: 1, overflowX: 'auto' }}>
            {DOCS.map((d) => {
              const on = pathname === d.to;
              return (
                <Box
                  key={d.to}
                  component={RouterLink}
                  to={d.to}
                  aria-current={on ? 'page' : undefined}
                  sx={{
                    display: 'flex', alignItems: 'center', minHeight: 48, px: 2, fontWeight: 500, fontSize: 15,
                    textDecoration: 'none', whiteSpace: 'nowrap',
                    color: on ? 'primary.main' : 'text.secondary',
                    borderBottom: '2px solid', borderColor: on ? 'primary.main' : 'transparent',
                  }}
                >
                  {d.label}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
      <Outlet />
    </Box>
  );
}
