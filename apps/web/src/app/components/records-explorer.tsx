'use client';

import { Card } from '@heroui/react';
import {
  transactionCategories,
  type ProductRow,
  type TotalsRow,
  type TransactionCategory,
  type TransactionKind,
} from '@org/shared';
import { useEffect, useMemo, useState } from 'react';
import { getProducts, getTotals } from '../lib/files-api';
import { categoryLabels, formatMoney } from '../lib/format';

type Scope = 'all' | 'expense' | 'income' | 'staff';

const scopeLabels: Record<Scope, string> = {
  all: 'Todo',
  expense: 'Gastos',
  income: 'Ingresos',
  staff: 'Personal',
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 90);
  return { from: isoDate(from), to: isoDate(to) };
}

function formatBucket(bucketStart: string, groupBy: 'week' | 'month'): string {
  const date = new Date(`${bucketStart}T00:00:00Z`);
  if (groupBy === 'month') {
    return date.toLocaleDateString('es', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const end = new Date(date);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  return `${fmt(date)} – ${fmt(end)}`;
}

const inputClass =
  'rounded-lg border border-separator bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent';

export function RecordsExplorer() {
  const [range, setRange] = useState(defaultRange);
  const [groupBy, setGroupBy] = useState<'week' | 'month'>('week');
  const [scope, setScope] = useState<Scope>('all');
  const [totals, setTotals] = useState<TotalsRow[] | null>(null);
  const [purchases, setPurchases] = useState<ProductRow[]>([]);
  const [sales, setSales] = useState<ProductRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!range.from || !range.to || range.from > range.to) return;
    let cancelled = false;
    const kind: TransactionKind | undefined =
      scope === 'expense' || scope === 'staff'
        ? 'expense'
        : scope === 'income'
          ? 'income'
          : undefined;
    const category: TransactionCategory | undefined =
      scope === 'staff' ? 'staff' : undefined;

    Promise.all([
      getTotals({ ...range, groupBy, kind, category }),
      getProducts({ ...range, direction: 'purchase' }),
      getProducts({ ...range, direction: 'sale' }),
    ])
      .then(([totalRows, purchaseRows, saleRows]) => {
        if (cancelled) return;
        setTotals(totalRows);
        setPurchases(purchaseRows);
        setSales(saleRows);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : 'No se pudieron cargar los datos',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [range, groupBy, scope]);

  const buckets = useMemo(() => {
    const map = new Map<string, TotalsRow[]>();
    for (const row of totals ?? []) {
      map.set(row.bucketStart, [...(map.get(row.bucketStart) ?? []), row]);
    }
    return [...map.entries()];
  }, [totals]);

  const sum = (kind: TransactionKind) =>
    (totals ?? [])
      .filter((r) => r.kind === kind)
      .reduce((acc, r) => acc + r.totalMinor, 0);
  const unconfirmed = (totals ?? []).reduce(
    (acc, r) => acc + r.unconfirmedMinor,
    0,
  );
  const currency = totals?.[0]?.currency ?? 'USD';
  const invalidRange = !range.from || !range.to || range.from > range.to;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Desde
          <input
            type="date"
            className={inputClass}
            value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Hasta
          <input
            type="date"
            className={inputClass}
            value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
          />
        </label>
        <div className="flex flex-col gap-1 text-xs text-muted">
          Agrupar por
          <div className="flex overflow-hidden rounded-lg border border-separator">
            {(['week', 'month'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={groupBy === value}
                onClick={() => setGroupBy(value)}
                className={`px-3 py-1.5 text-sm ${
                  groupBy === value
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-default'
                }`}
              >
                {value === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1 text-xs text-muted">
          Mostrar
          <div className="flex overflow-hidden rounded-lg border border-separator">
            {(Object.keys(scopeLabels) as Scope[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={scope === value}
                onClick={() => setScope(value)}
                className={`px-3 py-1.5 text-sm ${
                  scope === value
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-default'
                }`}
              >
                {scopeLabels[value]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {invalidRange && (
        <p role="alert" className="text-sm text-danger">
          Revisa el rango de fechas: «Desde» debe ser anterior o igual a
          «Hasta».
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <Card.Content>
            <p className="text-xs uppercase tracking-wide text-muted">Gastos</p>
            <p className="text-2xl font-semibold">
              {formatMoney(sum('expense'), currency)}
            </p>
          </Card.Content>
        </Card>
        <Card>
          <Card.Content>
            <p className="text-xs uppercase tracking-wide text-muted">
              Ingresos
            </p>
            <p className="text-2xl font-semibold">
              {formatMoney(sum('income'), currency)}
            </p>
          </Card.Content>
        </Card>
        <Card>
          <Card.Content>
            <p className="text-xs uppercase tracking-wide text-muted">
              Sin confirmar
            </p>
            <p className="text-2xl font-semibold">
              {formatMoney(unconfirmed, currency)}
            </p>
            <p className="text-xs text-muted">
              Incluido en los totales; confírmalo en cada archivo.
            </p>
          </Card.Content>
        </Card>
      </div>

      <Card>
        <Card.Header>
          <Card.Title>
            {groupBy === 'week' ? 'Por semana' : 'Por mes'}
            {scope === 'staff' ? ' · gastos de personal' : ''}
          </Card.Title>
        </Card.Header>
        <Card.Content className="overflow-x-auto p-0">
          {buckets.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">
              No hay datos en este periodo. Los archivos «Requiere revisión» no
              se cuentan hasta confirmarlos.
            </p>
          ) : (
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-separator text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Periodo</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Sin confirmar
                  </th>
                </tr>
              </thead>
              <tbody>
                {buckets.map(([bucket, rows]) =>
                  rows.map((row, index) => (
                    <tr
                      key={`${bucket}-${row.kind}-${row.category}-${row.currency}`}
                      className="border-b border-separator last:border-0"
                    >
                      <td className="px-4 py-2 font-medium">
                        {index === 0 ? formatBucket(bucket, groupBy) : ''}
                      </td>
                      <td className="px-4 py-2">
                        {row.kind === 'expense' ? 'Gasto' : 'Ingreso'}
                      </td>
                      <td className="px-4 py-2">
                        {categoryLabels[row.category]}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {formatMoney(row.totalMinor, row.currency)}
                      </td>
                      <td className="px-4 py-2 text-right text-muted">
                        {row.unconfirmedMinor > 0
                          ? formatMoney(row.unconfirmedMinor, row.currency)
                          : '—'}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          )}
        </Card.Content>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProductTable title="Productos comprados" rows={purchases} />
        <ProductTable title="Productos vendidos" rows={sales} />
      </div>
      <p className="text-xs text-muted">
        Categorías disponibles:{' '}
        {transactionCategories.map((c) => categoryLabels[c]).join(', ')}.
      </p>
    </div>
  );
}

function ProductTable({ title, rows }: { title: string; rows: ProductRow[] }) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>{title}</Card.Title>
      </Card.Header>
      <Card.Content className="p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">
            Sin productos en este periodo.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-separator text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.productName}-${row.currency}`}
                  className="border-b border-separator last:border-0"
                >
                  <td className="px-4 py-2">{row.productName}</td>
                  <td className="px-4 py-2 text-right text-muted">
                    {row.quantity}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {formatMoney(row.totalMinor, row.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card.Content>
    </Card>
  );
}
