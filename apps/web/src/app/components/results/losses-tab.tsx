'use client';

import {
  addDays,
  analyzeResults,
  type Period,
  type ResultsAnalysis,
} from '@org/shared';
import Link from 'next/link';
import { useState } from 'react';
import { getTotals } from '../../lib/files-api';
import {
  categoryLabels,
  formatMoney,
  formatPeriod,
  formatShortDate,
} from '../../lib/format';
import { NetBarChart } from '../charts';
import { SourceDrawer } from './source-drawer';
import {
  DashboardSection,
  Stat,
  useSection,
} from '../dashboard/dashboard-section';

type GroupBy = 'week' | 'month';

function monthLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('es', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

function bucketEnd(start: string, groupBy: GroupBy): string {
  if (groupBy === 'week') return addDays(start, 6);
  const d = new Date(`${start}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
}

export function LossesTab({
  period,
  refreshKey,
}: {
  period: Period;
  refreshKey: number;
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [selected, setSelected] = useState(0);
  const [pickedBucket, setPickedBucket] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const state = useSection(
    async (): Promise<ResultsAnalysis[]> =>
      analyzeResults(await getTotals({ ...period, groupBy })),
    [period.from, period.to, groupBy],
    { refreshKey },
  );
  const range = formatPeriod(period.from, period.to);
  const label = (iso: string) =>
    groupBy === 'month' ? monthLabel(iso) : formatShortDate(iso);

  return (
    <DashboardSection
      title="Resultados y pérdidas"
      subtitle={`Ingresos menos gastos por ${groupBy === 'month' ? 'mes' : 'semana'} · ${range}`}
      state={state}
    >
      {(results) => {
        if (results.length === 0) {
          return (
            <div className="flex flex-col items-start gap-3 py-2 text-sm">
              <p className="text-muted">
                No hay gastos ni ingresos en este periodo. Los archivos «En
                revisión» no se cuentan hasta confirmarlos.
              </p>
              <Link href="/upload" className="text-accent hover:underline">
                Subir documentos
              </Link>
            </div>
          );
        }
        const result = results[Math.min(selected, results.length - 1)];
        const money = (minor: number) => formatMoney(minor, result.currency);
        const losing = result.periods.filter((p) => p.isLoss);
        const picked =
          result.periods.find((p) => p.bucketStart === pickedBucket) ?? null;
        const unconfirmed = result.periods.reduce(
          (acc, p) => acc + p.unconfirmedMinor,
          0,
        );

        return (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <div
                className="flex overflow-hidden rounded-lg border border-separator"
                role="group"
                aria-label="Agrupar por"
              >
                {(['week', 'month'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={groupBy === value}
                    onClick={() => {
                      setGroupBy(value);
                      setPickedBucket(null);
                    }}
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
              {results.length > 1 && (
                <div className="flex gap-2" role="tablist" aria-label="Moneda">
                  {results.map((r, i) => (
                    <button
                      key={r.currency}
                      type="button"
                      role="tab"
                      aria-selected={i === selected}
                      onClick={() => {
                        setSelected(i);
                        setPickedBucket(null);
                      }}
                      className={`rounded-lg border border-separator px-3 py-1 text-sm ${
                        i === selected
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-default'
                      }`}
                    >
                      {r.currency}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <Stat label="Ingresos" value={money(result.totalIncomeMinor)} />
              <Stat label="Gastos" value={money(result.totalExpensesMinor)} />
              <Stat
                label="Resultado neto"
                value={money(result.totalNetMinor)}
                tone={result.totalNetMinor >= 0 ? 'success' : 'danger'}
              />
              <Stat
                label="Periodos con pérdida"
                value={result.losingPeriods}
                tone={result.losingPeriods > 0 ? 'danger' : undefined}
                hint={`de ${result.periods.length}`}
              />
              <Stat
                label="Mayor pérdida"
                value={
                  result.largestLossMinor > 0
                    ? money(result.largestLossMinor)
                    : '—'
                }
                tone={result.largestLossMinor > 0 ? 'danger' : undefined}
              />
            </div>

            {unconfirmed > 0 && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                {money(unconfirmed)} aún sin confirmar. Está incluido en los
                resultados; confírmalo en cada archivo para estar seguro.
              </p>
            )}

            <NetBarChart
              ariaLabel={`Resultado neto por ${groupBy === 'month' ? 'mes' : 'semana'} en ${result.currency}, ${range}`}
              labels={result.periods.map((p) => label(p.bucketStart))}
              values={result.periods.map((p) => p.netMinor)}
              format={(v) => formatMoney(Math.round(v), result.currency)}
              selectedIndex={picked ? result.periods.indexOf(picked) : null}
              onSelect={(i) => setPickedBucket(result.periods[i].bucketStart)}
            />

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Periodos con pérdida</h3>
              {losing.length === 0 ? (
                <p className="text-sm text-success">
                  No hubo pérdidas en este rango: los ingresos cubrieron los
                  gastos en todos los periodos.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {losing.map((p) => (
                    <li key={p.bucketStart}>
                      <button
                        type="button"
                        aria-pressed={pickedBucket === p.bucketStart}
                        onClick={() =>
                          setPickedBucket(
                            pickedBucket === p.bucketStart
                              ? null
                              : p.bucketStart,
                          )
                        }
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-separator px-3 py-2 text-left text-sm hover:bg-default"
                      >
                        <span>{label(p.bucketStart)}</span>
                        <span className="font-semibold text-danger">
                          {money(p.netMinor)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {picked && (
              <div className="flex flex-col gap-3 rounded-xl border border-separator p-4 text-sm">
                <h3 className="font-medium">
                  {label(picked.bucketStart)} ·{' '}
                  {picked.isLoss ? 'pérdida' : 'ganancia'} de{' '}
                  {money(Math.abs(picked.netMinor))}
                </h3>
                <p className="text-muted">
                  Ingresos {money(picked.incomeMinor)} · gastos{' '}
                  {money(picked.expensesMinor)} · acumulado{' '}
                  {money(picked.cumulativeNetMinor)}
                </p>
                <button
                  type="button"
                  onClick={() => setShowSource((v) => !v)}
                  className="self-start text-accent hover:underline"
                >
                  {showSource
                    ? 'Ocultar registros'
                    : 'Ver registros del periodo'}
                </button>
                {showSource && (
                  <SourceDrawer
                    scope={{
                      title: label(picked.bucketStart),
                      from: picked.bucketStart,
                      to: bucketEnd(picked.bucketStart, groupBy),
                      kind: 'expense',
                    }}
                    onClose={() => setShowSource(false)}
                  />
                )}
                <div>
                  <p className="mb-1 text-muted">Mayores gastos del periodo</p>
                  {picked.topExpenseCategories.length === 0 ? (
                    <p>Sin gastos.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {picked.topExpenseCategories.map((c) => (
                        <li
                          key={c.category}
                          className="flex justify-between gap-3"
                        >
                          <span>{categoryLabels[c.category]}</span>
                          <span>{money(c.totalMinor)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      }}
    </DashboardSection>
  );
}
