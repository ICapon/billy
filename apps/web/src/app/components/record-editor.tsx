'use client';

import { Button } from '@heroui/react';
import {
  lineDirections,
  transactionCategories,
  transactionKinds,
  type LineDirection,
  type Transaction,
  type TransactionCategory,
  type TransactionKind,
  type TransactionUpdate,
} from '@org/shared';
import { useState } from 'react';
import { confirmRecord, deleteRecord, updateRecord } from '../lib/files-api';
import { categoryLabels, formatMoney } from '../lib/format';

interface LineDraft {
  productName: string;
  quantity: string;
  unitPrice: string;
  total: string;
  direction: LineDirection;
}

interface Draft {
  occurredOn: string;
  amount: string;
  currency: string;
  kind: TransactionKind;
  category: TransactionCategory;
  counterparty: string;
  lines: LineDraft[];
}

const toMajor = (minor: number | null) =>
  minor === null ? '' : (minor / 100).toFixed(2);
const toMinor = (value: string) => Math.round(Number.parseFloat(value) * 100);

function toDraft(record: Transaction): Draft {
  return {
    occurredOn: record.occurredOn,
    amount: toMajor(record.amountMinor),
    currency: record.currency,
    kind: record.kind,
    category: record.category,
    counterparty: record.counterparty ?? '',
    lines: record.lineItems.map((item) => ({
      productName: item.productName,
      quantity: String(item.quantity),
      unitPrice: toMajor(item.unitPriceMinor),
      total: toMajor(item.totalMinor),
      direction: item.direction,
    })),
  };
}

/** Returns an update payload or a readable validation error. */
function toUpdate(draft: Draft): TransactionUpdate | string {
  const amountMinor = toMinor(draft.amount);
  if (!draft.occurredOn) return 'Indica la fecha';
  if (!Number.isFinite(amountMinor) || amountMinor < 0)
    return 'El monto no es válido';
  if (!/^[A-Za-z]{3}$/.test(draft.currency))
    return 'La moneda debe tener 3 letras (p. ej. USD)';
  const lineItems: NonNullable<TransactionUpdate['lineItems']> = [];
  for (const line of draft.lines) {
    const quantity = Number.parseFloat(line.quantity);
    const total = toMinor(line.total);
    if (!line.productName.trim()) return 'Cada producto necesita un nombre';
    if (!(quantity > 0))
      return 'La cantidad de cada producto debe ser mayor que 0';
    if (!Number.isFinite(total) || total < 0)
      return 'El total de cada producto no es válido';
    lineItems.push({
      productName: line.productName.trim(),
      quantity,
      unitPriceMinor: line.unitPrice === '' ? null : toMinor(line.unitPrice),
      totalMinor: total,
      direction: line.direction,
    });
  }
  return {
    occurredOn: draft.occurredOn,
    amountMinor,
    currency: draft.currency.toUpperCase(),
    kind: draft.kind,
    category: draft.category,
    counterparty:
      draft.counterparty.trim() === '' ? null : draft.counterparty.trim(),
    lineItems,
  };
}

const inputClass =
  'w-full rounded-lg border border-separator bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}

export function RecordEditor({
  record,
  onChange,
  onDeleted,
}: {
  record: Transaction;
  onChange: (record: Transaction) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(record));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo completar la acción',
      );
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const update = toUpdate(draft);
      if (typeof update === 'string') {
        setError(update);
        return;
      }
      onChange(await updateRecord(record.id, update));
      setEditing(false);
    });

  const confirm = () =>
    run(async () => onChange(await confirmRecord(record.id)));
  const remove = () =>
    run(async () => {
      if (!window.confirm('¿Eliminar este registro? No se puede deshacer.'))
        return;
      await deleteRecord(record.id);
      onDeleted(record.id);
    });

  const setLine = (index: number, changes: Partial<LineDraft>) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((line, i) =>
        i === index ? { ...line, ...changes } : line,
      ),
    }));

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-separator p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5 text-sm">
          <span className="font-medium">
            {record.kind === 'expense' ? 'Gasto' : 'Ingreso'} ·{' '}
            {categoryLabels[record.category]}
            {record.excludedReason && (
              <span className="ml-2 rounded-full bg-default px-2 py-0.5 text-xs text-muted">
                Fusionado
              </span>
            )}
          </span>
          <span className="text-muted">
            {record.occurredOn} · {record.counterparty ?? 'Sin contraparte'}
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-lg font-semibold">
            {formatMoney(record.amountMinor, record.currency)}
          </span>
          <span
            className={`text-xs ${record.confirmed ? 'text-success' : 'text-warning'}`}
          >
            {record.confirmed
              ? 'Confirmado'
              : `Sin confirmar · confianza ${Math.round(record.confidence * 100)}%`}
          </span>
        </div>
      </div>

      {!editing && record.lineItems.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-muted">
          {record.lineItems.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span className="truncate">
                {item.quantity} × {item.productName}{' '}
                <span className="text-xs">
                  ({item.direction === 'purchase' ? 'compra' : 'venta'})
                </span>
              </span>
              <span>{formatMoney(item.totalMinor, record.currency)}</span>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Fecha">
              <input
                type="date"
                className={inputClass}
                value={draft.occurredOn}
                onChange={(e) =>
                  setDraft({ ...draft, occurredOn: e.target.value })
                }
              />
            </Field>
            <Field label="Monto">
              <input
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              />
            </Field>
            <Field label="Moneda">
              <input
                maxLength={3}
                className={inputClass}
                value={draft.currency}
                onChange={(e) =>
                  setDraft({ ...draft, currency: e.target.value.toUpperCase() })
                }
              />
            </Field>
            <Field label="Tipo">
              <select
                className={inputClass}
                value={draft.kind}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    kind: e.target.value as TransactionKind,
                  })
                }
              >
                {transactionKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind === 'expense' ? 'Gasto' : 'Ingreso'}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Categoría">
              <select
                className={inputClass}
                value={draft.category}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    category: e.target.value as TransactionCategory,
                  })
                }
              >
                {transactionCategories.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabels[category]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Contraparte">
              <input
                className={inputClass}
                value={draft.counterparty}
                onChange={(e) =>
                  setDraft({ ...draft, counterparty: e.target.value })
                }
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted">Productos</span>
            {draft.lines.map((line, index) => (
              <div
                key={index}
                className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]"
              >
                <input
                  aria-label="Producto"
                  placeholder="Producto"
                  className={inputClass}
                  value={line.productName}
                  onChange={(e) =>
                    setLine(index, { productName: e.target.value })
                  }
                />
                <input
                  aria-label="Cantidad"
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="Cant."
                  className={inputClass}
                  value={line.quantity}
                  onChange={(e) => setLine(index, { quantity: e.target.value })}
                />
                <input
                  aria-label="Precio unitario"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Precio"
                  className={inputClass}
                  value={line.unitPrice}
                  onChange={(e) =>
                    setLine(index, { unitPrice: e.target.value })
                  }
                />
                <input
                  aria-label="Total"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Total"
                  className={inputClass}
                  value={line.total}
                  onChange={(e) => setLine(index, { total: e.target.value })}
                />
                <select
                  aria-label="Compra o venta"
                  className={inputClass}
                  value={line.direction}
                  onChange={(e) =>
                    setLine(index, {
                      direction: e.target.value as LineDirection,
                    })
                  }
                >
                  {lineDirections.map((direction) => (
                    <option key={direction} value={direction}>
                      {direction === 'purchase' ? 'Compra' : 'Venta'}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="text-muted hover:text-danger"
                  aria-label="Quitar producto"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      lines: d.lines.filter((_, i) => i !== index),
                    }))
                  }
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="self-start text-sm text-accent hover:underline"
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  lines: [
                    ...d.lines,
                    {
                      productName: '',
                      quantity: '1',
                      unitPrice: '',
                      total: '',
                      direction: d.kind === 'expense' ? 'purchase' : 'sale',
                    },
                  ],
                }))
              }
            >
              + Agregar producto
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {editing ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={busy}
              onPress={() => {
                setDraft(toDraft(record));
                setEditing(false);
                setError(null);
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" isDisabled={busy} onPress={() => void save()}>
              Guardar y confirmar
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={busy}
              onPress={() => void remove()}
            >
              Eliminar
            </Button>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={busy}
              onPress={() => {
                setDraft(toDraft(record));
                setEditing(true);
              }}
            >
              Editar
            </Button>
            {!record.confirmed && (
              <Button
                size="sm"
                isDisabled={busy}
                onPress={() => void confirm()}
              >
                Confirmar
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
