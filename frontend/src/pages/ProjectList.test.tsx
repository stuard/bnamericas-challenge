import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { vi } from 'vitest';
import theme from '../theme';
import * as api from '../api';
import ProjectList, { filterProjects } from './ProjectList';
import type { ProjectSummary } from '../types';

vi.mock('../api');
const listProjects = vi.mocked(api.listProjects);

const P = (id: string, name: string, sector: string, country: string, stage: string): ProjectSummary => ({ id, name, sector, country, stage });
const FEW = [
  P('1', 'Solar Atacama', 'Energy', 'Chile', 'Financing'),
  P('2', 'Metro Bogota', 'Transport', 'Colombia', 'Tender'),
  P('3', 'Desalination Sur', 'Water', 'Chile', 'Construction'),
];
const MANY = Array.from({ length: 30 }, (_, i) => P(String(i + 1), `Project ${String(i + 1).padStart(2, '0')}`, 'Energy', 'Peru', 'Idea'));

function Where() { return <div data-testid="where">{useLocation().pathname}</div>; }
function show() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={['/']}>
        <Routes><Route path="/" element={<ProjectList />} /><Route path="/projects/:id" element={<Where />} /></Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}
const bodyRows = () => screen.getAllByRole('row').slice(1);

beforeEach(() => { listProjects.mockReset(); });

describe('ProjectList', () => {
  it('shows a skeleton, then rows from the mocked api', async () => {
    listProjects.mockResolvedValue(FEW);
    show();
    expect(screen.getByTestId('list-loading')).toBeInTheDocument();
    expect(await screen.findByText('Solar Atacama')).toBeInTheDocument();
    expect(listProjects).toHaveBeenCalledTimes(1);
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByText('3 projects')).toBeInTheDocument();
  });

  it('search needs all terms and matches name or country', async () => {
    listProjects.mockResolvedValue(FEW);
    show();
    await screen.findByText('Solar Atacama');
    await userEvent.type(screen.getByLabelText('Search by name or country'), 'chile desal');
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText('Desalination Sur')).toBeInTheDocument();
    expect(filterProjects(FEW, 'colombia solar', '', '')).toHaveLength(0);
  });

  it('filters by Sector and by Stage', async () => {
    listProjects.mockResolvedValue(FEW);
    show();
    await screen.findByText('Solar Atacama');
    await userEvent.click(screen.getByRole('combobox', { name: 'Sector' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Water' }));
    expect(bodyRows()).toHaveLength(1);
    await userEvent.click(screen.getByRole('combobox', { name: 'Sector' }));
    await userEvent.click(await screen.findByRole('option', { name: 'All' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Stage' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Tender' }));
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText('Metro Bogota')).toBeInTheDocument();
  });

  it('sorts when a column header is clicked', async () => {
    listProjects.mockResolvedValue(FEW);
    show();
    await screen.findByText('Solar Atacama');
    expect(within(bodyRows()[0]).getByText('Desalination Sur')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Country' }));
    expect(within(bodyRows()[0]).getByText('Chile', { selector: 'td' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Country' }));
    expect(within(bodyRows()[0]).getByText('Colombia')).toBeInTheDocument();
  });

  it('shows the empty state and Clear filters restores the rows', async () => {
    listProjects.mockResolvedValue(FEW);
    show();
    await screen.findByText('Solar Atacama');
    await userEvent.type(screen.getByLabelText('Search by name or country'), 'zzz');
    expect(screen.getByText('No projects match')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(bodyRows()).toHaveLength(3);
  });

  it('shows the error and Retry loads again', async () => {
    listProjects.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(FEW);
    show();
    expect(await screen.findByText('Could not load projects')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Solar Atacama')).toBeInTheDocument();
    expect(listProjects).toHaveBeenCalledTimes(2);
  });

  it('a row click goes to /projects/:id', async () => {
    listProjects.mockResolvedValue(FEW);
    show();
    await userEvent.click(await screen.findByText('Metro Bogota'));
    expect(screen.getByTestId('where')).toHaveTextContent('/projects/2');
  });

  it('paginates 25 per page with the footer text for 30 rows', async () => {
    listProjects.mockResolvedValue(MANY);
    show();
    await screen.findByText('Project 01');
    expect(bodyRows()).toHaveLength(25);
    expect(screen.getByText('1–25 of 30')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(screen.getByText('26–30 of 30')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(5);
  });

  it('on a phone the rows become a list with sector · country', async () => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
    listProjects.mockResolvedValue(FEW);
    try {
      show();
      await screen.findByText('Solar Atacama');
      expect(screen.queryByRole('table')).toBeNull();
      expect(screen.getByText('Energy · Chile')).toBeInTheDocument();
      await waitFor(() => expect(within(screen.getByRole('list', { name: 'Projects' })).getAllByRole('listitem')).toHaveLength(3));
    } finally {
      // @ts-expect-error remove the stub so other tests use the desktop table
      delete window.matchMedia;
    }
  });
});
