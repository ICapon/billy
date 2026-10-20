import { fireEvent, render, screen } from '@testing-library/react';
import { SourceDrawer } from '../src/app/components/results/source-drawer';
import * as api from '../src/app/lib/files-api';
import { formatMoney } from '../src/app/lib/format';

jest.mock('../src/app/lib/files-api');
const mocked = api as jest.Mocked<typeof api>;
const norm = (v: string) => v.replace(/\s/g, ' ');

const record = (id: string, amountMinor: number, counterparty: string) =>
  ({
    id,
    fileId: '3f0e8b4e-7c1a-4d6e-9a53-1f6f5d0c2b11',
    occurredOn: '2026-03-05',
    amountMinor,
    currency: 'USD',
    kind: 'expense' as const,
    category: 'supplies' as const,
    counterparty,
    confidence: 0.9,
    confirmed: false,
    lineItems: [],
  }) as never;

beforeEach(() => {
  jest.resetAllMocks();
  mocked.getRecords.mockResolvedValue({
    items: [record('a', 1000, 'Ferretería'), record('b', 2500, 'Papelería')],
    nextCursor: null,
  });
});

describe('SourceDrawer', () => {
  it('lists the records with a link to each file and their total', async () => {
    render(
      <SourceDrawer
        scope={{ title: 'marzo', from: '2026-03-01', to: '2026-03-31' }}
        onClose={jest.fn()}
      />,
    );
    expect(await screen.findByText(/Ferretería/)).toBeTruthy();
    expect(
      screen
        .getAllByRole('link', { name: 'Ver archivo' })[0]
        .getAttribute('href'),
    ).toContain('/files/');
    expect(
      screen.getByText((c) =>
        norm(c).includes(`Total: ${norm(formatMoney(3500, 'USD'))}`),
      ),
    ).toBeTruthy();
    expect(mocked.getRecords).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2026-03-01', to: '2026-03-31' }),
    );
  });

  it('re-queries when the document type changes and closes on request', async () => {
    const onClose = jest.fn();
    render(<SourceDrawer scope={{ title: 'marzo' }} onClose={onClose} />);
    await screen.findByText(/Ferretería/);
    fireEvent.change(screen.getByLabelText('Tipo de documento'), {
      target: { value: 'receipt' },
    });
    await screen.findByText(/Ferretería/);
    expect(mocked.getRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({ documentType: 'receipt' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('explains an empty result', async () => {
    mocked.getRecords.mockResolvedValue({ items: [], nextCursor: null });
    render(<SourceDrawer scope={{ title: 'marzo' }} onClose={jest.fn()} />);
    expect(
      await screen.findByText('No hay registros para este filtro.'),
    ).toBeTruthy();
  });
});
