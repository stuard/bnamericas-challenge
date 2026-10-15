import { Route, Routes } from 'react-router-dom';
import { Typography } from '@mui/material';
import AppShell from './components/AppShell';
import ProjectList from './pages/ProjectList';
import ProjectEdit from './pages/ProjectEdit';
import DocsPage from './pages/DocsPage';
import DocsHome from './pages/DocsHome';

// All routes live inside AppShell so the top bar is always there.
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<ProjectList />} />
        <Route path="/projects/:id" element={<ProjectEdit />} />
        <Route path="/docs" element={<DocsHome />} />
        <Route path="/docs/general" element={<DocsPage page="general" />} />
        <Route path="/docs/technical" element={<DocsPage page="technical" />} />
        <Route path="/docs/guide" element={<DocsPage page="guide" />} />
        <Route path="*" element={<Typography sx={{ p: 3 }}>Page not found.</Typography>} />
      </Route>
    </Routes>
  );
}
