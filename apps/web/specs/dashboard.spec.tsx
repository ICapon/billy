import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ActivitySummary, AttentionItems, CostSummary } from '@org/shared';
import { ActivitySection } from '../src/app/components/dashboard/activity-section';
import { PeriodPicker } from '../src/app/components/dashboard/period-picker';
import DashboardPage from '../src/app/(app)/dashboard/page';
import * as api from '../src/app/lib/files-api';
import * as chatApi from '../src/app/lib/chat-api';

jest.mock('../src/app/lib/files-api');
jest.mock('../src/app/lib/chat-api');
const mocked = api as jest.Mocked<typeof api>;
const mockedChat = chatApi as jest.Mocked<typeof chatApi>;

const emptyActivity: ActivitySummary = {
  from: '2026-09-19',
  to: '2026-10-18',
  bucket: 'day',
  counts: {
    received: 0,
    processing: 0,
    queuedLimit: 0,
    completed: 0,
    needsReview: 0,
    failed: 0,
  },
  total: 0,
  finished: 0,
  successRate: null,
  avgAnalysisSeconds: null,
  series: [],
  byMethod: { digital: 0, ocr: 0, vision: 0 },
};

const activity: ActivitySummary = {
  ...emptyActivity,
  counts: {
    received: 0,
    processing: 1,
    queuedLimit: 0,
    completed: 5,
    needsReview: 1,
    failed: 1,
  },
  total: 8,
  finished: 7,
  successRate: 5 / 7,
  avgAnalysisSeconds: 75,
  series: [
    { bucketStart: '2026-10-01', uploaded: 3, finished: 2 },
    { bucketStart: '2026-10-02', uploaded: 5, finished: 4 },
  ],
  byMethod: { digital: 3, ocr: 2, vision: 1 },
};

const attention: AttentionItems = {
  needsReview: 2,
  failed: 0,
  queuedLimit: 0,
  pendingDuplicates: 1,
  unconfirmed: [{ currency: 'USD', amountMinor: 12500 }],
};

const cost: CostSummary = {
  month: '2026-10',
  totalMicroUsd: 1_200_000,
  limitMicroUsd: 5_000_000,
  limitReached: false,
  avgPerFileMicroUsd: 150_000,
  byKind: {},
  byTier: { digital: 4, ocr: 3, vision: 1 },
};

const period = { from: '2026-09-19', to: '2026-10-18' };

beforeEach(() => {
  jest.resetAllMocks();
  mocked.getActivity.mockResolvedValue(activity);
  mocked.getAttention.mockResolvedValue(attention);
  mocked.getTotals.mockResolvedValue([]);
  mocked.getProducts.mockResolvedValue([]);
  mocked.getCostSummary.mockResolvedValue(cost);
  mockedChat.getChatStatus.mockResolvedValue({
    enabled: true,
    hasDocuments: true,
    suggestions: [],
  });
});

describe('ActivitySection', () => {
  it('shows real counts, the success rate and the average time', async () => {
    render(<ActivitySection period={period} refreshKey={0} />);
    expect(await screen.findByText('Completados')).toBeTruthy();
    expect(screen.getByText('71 %')).toBeTruthy(); // 5 / 7
    expect(screen.getByText('1 min 15 s')).toBeTruthy();
    expect(mocked.getActivity).toHaveBeenCalledWith(period);
  });

  it('shows an explanatory empty state with no invented numbers', async () => {
    mocked.getActivity.mockResolvedValue(emptyActivity);
    render(<ActivitySection period={period} refreshKey={0} />);
    expect(
      await screen.findByText(/Aún no hay archivos en este periodo/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: /Subir mi primer archivo/ })
        .getAttribute('href'),
    ).toBe('/upload');
    expect(screen.queryByText('Tasa de éxito')).toBeNull();
  });

  it('shows an error with a retry that loads the data', async () => {
    mocked.getActivity.mockRejectedValueOnce(new Error('boom'));
    render(<ActivitySection period={period} refreshKey={0} />);
    expect(await screen.findByText('boom')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Completados')).toBeTruthy();
    expect(mocked.getActivity).toHaveBeenCalledTimes(2);
  });

  it('keeps the last data when a later refresh fails', async () => {
    const { rerender } = render(
      <ActivitySection period={period} refreshKey={0} />,
    );
    await screen.findByText('Completados');
    mocked.getActivity.mockRejectedValueOnce(new Error('temporal'));
    rerender(<ActivitySection period={period} refreshKey={1} />);
    expect(await screen.findByText(/No se pudo actualizar/)).toBeTruthy();
    expect(screen.getByText('Completados')).toBeTruthy();
  });

  it('ignores a slow answer for an old period', async () => {
    let resolveOld: (value: ActivitySummary) => void = () => undefined;
    mocked.getActivity.mockImplementationOnce(
      () => new Promise((resolve) => (resolveOld = resolve)),
    );
    const { rerender } = render(
      <ActivitySection period={period} refreshKey={0} />,
    );
    mocked.getActivity.mockResolvedValueOnce({ ...activity, total: 42 });
    rerender(
      <ActivitySection
        period={{ from: '2026-10-12', to: '2026-10-18' }}
        refreshKey={0}
      />,
    );
    expect(await screen.findByText('42')).toBeTruthy();
    resolveOld({ ...activity, total: 7 });
    await waitFor(() => expect(screen.queryByText('7')).toBeNull());
    expect(screen.getByText('42')).toBeTruthy();
  });
});

describe('PeriodPicker', () => {
  it('applies a preset with a fresh period', () => {
    const onChange = jest.fn();
    render(<PeriodPicker preset="30d" period={period} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '7 días' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe('7d');
    expect(onChange.mock.calls[0][1].to >= onChange.mock.calls[0][1].from).toBe(
      true,
    );
  });

  it('rejects an inverted custom range with a message and keeps the applied period', () => {
    const onChange = jest.fn();
    render(<PeriodPicker preset="30d" period={period} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Personalizado' }));
    fireEvent.change(screen.getByLabelText('Desde'), {
      target: { value: '2026-10-20' },
    });
    fireEvent.change(screen.getByLabelText('Hasta'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.getByRole('alert').textContent).toContain('anterior');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('applies a valid custom range', () => {
    const onChange = jest.fn();
    render(<PeriodPicker preset="30d" period={period} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Personalizado' }));
    fireEvent.change(screen.getByLabelText('Desde'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.change(screen.getByLabelText('Hasta'), {
      target: { value: '2026-10-10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onChange).toHaveBeenCalledWith('custom', {
      from: '2026-10-01',
      to: '2026-10-10',
    });
  });
});

describe('Dashboard page', () => {
  it('uses the last 30 days by default and requests every section with that period', async () => {
    render(<DashboardPage />);
    await screen.findByText('Gastos e ingresos');
    const call = mocked.getActivity.mock.calls[0][0];
    const days =
      (new Date(call.to).getTime() - new Date(call.from).getTime()) /
        86_400_000 +
      1;
    expect(days).toBe(30);
    expect(mocked.getTotals).toHaveBeenCalledWith({ ...call, groupBy: 'week' });
    expect(mocked.getProducts).toHaveBeenCalledWith(
      expect.objectContaining({ ...call, direction: 'purchase', limit: 5 }),
    );
  });

  it('shows the attention links and an all-clear message when nothing is pending', async () => {
    render(<DashboardPage />);
    expect(
      (
        await screen.findByRole('link', { name: /Archivos en revisión: 2/ })
      ).getAttribute('href'),
    ).toBe('/files?status=needs_review');
    expect(
      screen
        .getByRole('link', { name: /Posibles duplicados: 1/ })
        .getAttribute('href'),
    ).toBe('/files#duplicados');

    mocked.getAttention.mockResolvedValue({
      needsReview: 0,
      failed: 0,
      queuedLimit: 0,
      pendingDuplicates: 0,
      unconfirmed: [],
    });
    render(<DashboardPage />);
    expect(await screen.findByText(/Todo en orden/)).toBeTruthy();
  });

  it('isolates failures: one broken section does not blank the others', async () => {
    mocked.getTotals.mockRejectedValue(new Error('finanzas caídas'));
    render(<DashboardPage />);
    expect(await screen.findByText('finanzas caídas')).toBeTruthy();
    expect(await screen.findByText('Completados')).toBeTruthy(); // activity still renders
    expect(await screen.findByText('Costo del mes')).toBeTruthy(); // so does cost
    const retries = screen.getAllByRole('button', { name: 'Reintentar' });
    expect(retries).toHaveLength(1);

    mocked.getTotals.mockResolvedValue([]);
    fireEvent.click(retries[0]);
    expect(
      await screen.findByText(/No hay gastos ni ingresos en este periodo/),
    ).toBeTruthy();
  });

  it('refreshes every section from the manual button', async () => {
    render(<DashboardPage />);
    await screen.findByText('Completados');
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(mocked.getActivity).toHaveBeenCalledTimes(2));
    expect(mocked.getAttention).toHaveBeenCalledTimes(2);
    expect(mocked.getCostSummary).toHaveBeenCalledTimes(2);
  });
});
