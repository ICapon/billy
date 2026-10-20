import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BusinessFile, BusinessFileDetail } from '@org/shared';
import { FileDetail } from '../src/app/components/file-detail';
import { FilesTable } from '../src/app/components/files-table';
import { ReanalyzeBanner } from '../src/app/components/reanalyze-dialog';
import * as api from '../src/app/lib/files-api';

jest.mock('../src/app/lib/files-api');
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));
const mocked = api as jest.Mocked<typeof api>;

const file = (overrides: Partial<BusinessFile> = {}): BusinessFile => ({
  id: '3f0e8b4e-7c1a-4d6e-9a53-1f6f5d0c2b11',
  originalName: 'estado.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  status: 'completed',
  failureReason: null,
  readingMethod: 'digital',
  totalCostMicroUsd: 0,
  duplicateOf: null,
  documentType: 'bank_statement',
  documentTypeConfidence: 0.93,
  documentTypeManual: false,
  uploadedAt: '2026-10-18T10:00:00.000Z',
  ...overrides,
});

const detail = (
  overrides: Partial<BusinessFileDetail> = {},
): BusinessFileDetail => ({
  ...file(),
  records: [],
  documents: [
    {
      id: '6a1d2c3e-8f90-4abc-b123-0e9f8d7c6b5a',
      type: 'bank_statement',
      typeConfidence: 0.93,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      issueDate: null,
      currency: 'USD',
      consistency: 'ok',
      consistencyNotes: null,
      details: {
        accountIdentifier: '****1234',
        openingBalanceMinor: 100000,
        closingBalanceMinor: 145000,
        totalDepositsMinor: 80000,
        totalWithdrawalsMinor: 34500,
        totalFeesMinor: 500,
      },
      payrollLines: [],
    },
  ],
  ...overrides,
});

beforeEach(() => {
  jest.resetAllMocks();
  mocked.getReanalyzeEstimate.mockResolvedValue({
    files: 0,
    estimatedMicroUsd: 0,
    limitMicroUsd: null,
    remainingMicroUsd: null,
  });
});

describe('files list', () => {
  it('shows the type of each file, or "Sin clasificar", and filters by type', async () => {
    mocked.listFiles.mockResolvedValue({
      items: [
        file(),
        file({
          id: '1b1d2c3e-8f90-4abc-b123-0e9f8d7c6b5a',
          originalName: 'viejo.pdf',
          documentType: null,
          documentTypeConfidence: null,
        }),
      ],
      nextCursor: null,
    });
    render(<FilesTable />);
    expect(await screen.findByText('estado.pdf')).toBeTruthy();
    expect(screen.getAllByText('Estado de cuenta').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sin clasificar').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Tipo de documento'), {
      target: { value: 'unclassified' },
    });
    await waitFor(() =>
      expect(mocked.listFiles).toHaveBeenLastCalledWith(
        expect.objectContaining({ documentType: 'unclassified' }),
      ),
    );
  });
});

describe('file detail', () => {
  it('shows the data of the document and its type', async () => {
    mocked.getFile.mockResolvedValue(detail());
    render(<FileDetail id={file().id} />);
    expect(await screen.findByText('Saldo inicial')).toBeTruthy();
    expect(screen.getByText('Saldo final')).toBeTruthy();
    expect(screen.getByText('Cuadra · confianza en el tipo 93 %')).toBeTruthy();
  });

  it('asks before correcting the type and then re-reads the file', async () => {
    mocked.getFile.mockResolvedValue(detail());
    mocked.updateFileType.mockResolvedValue();
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<FileDetail id={file().id} />);
    const select = await screen.findByLabelText(
      'Corregir el tipo de documento',
    );

    fireEvent.change(select, { target: { value: 'payroll' } });
    expect(confirm).toHaveBeenCalled();
    expect(mocked.updateFileType).not.toHaveBeenCalled(); // cancelled

    confirm.mockReturnValue(true);
    fireEvent.change(select, { target: { value: 'payroll' } });
    await waitFor(() =>
      expect(mocked.updateFileType).toHaveBeenCalledWith(file().id, 'payroll'),
    );
    confirm.mockRestore();
  });

  it('offers re-analysis for a file without type', async () => {
    mocked.getFile.mockResolvedValue(
      detail({
        documentType: null,
        documentTypeConfidence: null,
        documents: [],
      }),
    );
    mocked.reanalyzeFile.mockResolvedValue();
    render(<FileDetail id={file().id} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Re-analizar' }));
    await waitFor(() =>
      expect(mocked.reanalyzeFile).toHaveBeenCalledWith(file().id),
    );
  });
});

describe('re-analysis banner', () => {
  it('stays hidden when every file has a type', async () => {
    render(<ReanalyzeBanner />);
    await waitFor(() => expect(mocked.getReanalyzeEstimate).toHaveBeenCalled());
    expect(screen.queryByText(/sin clasificar/)).toBeNull();
  });

  it('shows the estimate and only starts after confirming', async () => {
    mocked.getReanalyzeEstimate.mockResolvedValue({
      files: 12,
      estimatedMicroUsd: 144_000,
      limitMicroUsd: 500_000,
      remainingMicroUsd: 100_000,
    });
    mocked.reanalyzeAll.mockResolvedValue(12);
    render(<ReanalyzeBanner />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Re-analizar todos' }),
    );
    expect(screen.getByRole('dialog').textContent).toContain('12');
    expect(screen.getByRole('dialog').textContent).toContain('$0.14');
    expect(screen.getByRole('alert').textContent).toContain(
      'supera el presupuesto restante',
    );
    expect(mocked.reanalyzeAll).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar y re-analizar' }),
    );
    await waitFor(() => expect(mocked.reanalyzeAll).toHaveBeenCalledTimes(1));
  });
});
