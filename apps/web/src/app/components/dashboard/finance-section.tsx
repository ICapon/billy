'use client';

import { summarizeFinance, type Period } from '@org/shared';
import Link from 'next/link';
import { useState } from 'react';
import { getTotals } from '../../lib/files-api';
import {
  categoryLabels,
  formatMoney,
  formatPercent,
  formatPeriod,
  formatShortDate,
} from '../../lib/format';
import { GroupedBarChart, HorizontalBars } from '../charts';
import { DashboardSection, Stat, useSection } from './dashboard-section';

export function FinanceSection({
  period,
  refreshKey,
}: {
  period: Period;
  refreshKey: number;
}) {
  // Same rows the analysis screen uses, so both always agree.
  const state = useSection(
    async () =>
      summarizeFinance(await getTotals({ ...period, groupBy: 'week' })),
    [period.from, period.to],
    { refreshKey },
  );
  const [selected, setSelected] = useState(0);
  const range = formatPeriod(period.from, period.to);

  return (
    <DashboardSection
      title="Gastos e ingresos"
      subtitle={`Según tus documentos · ${range}`}
      state={state}
    >
      {(summaries) => {
        if (summaries.length === 0) {
          return (
            <p className="py-2 text-sm text-muted">
              No hay gastos ni ingresos en este periodo. Los archivos «En
              revisión» no se cuentan hasta confirmarlos.
            </p>
          );
        }
        const finance = summaries[Math.min(selected, summaries.length - 1)];
        const money = (minor: number) => formatMoney(minor, finance.currency);
        const first = finance.weekly[0]?.bucketStart;
        const partialEdges = !!first && first < period.from;

        return (
          <div className="flex flex-col gap-5">
            {summaries.length > 1 && (
              <div className="flex gap-2" role="tablist" aria-label="Moneda">
                {summaries.map((s, i) => (
                  <button
                    key={s.currency}
                    type="button"
                    role="tab"
                    aria-selected={i === selected}
                    onClick={() => setSelected(i)}
                    className={`rounded-lg border border-separator px-3 py-1 text-sm ${
                      i === selected
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-default'
                    }`}
                  >
                    {s.currency}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Gastos" value={money(finance.expensesMinor)} />
              <Stat label="Ingresos" value={money(finance.incomeMinor)} />
              <Stat
                label="Diferencia"
                value={money(finance.netMinor)}
                tone={finance.netMinor >= 0 ? 'success' : 'danger'}
                hint="ingresos − gastos"
              />
              <Stat
                label="Gasto en personal"
                value={money(finance.staffMinor)}
                hint={
                  finance.staffShare === null
                    ? 'sin gastos en el periodo'
                    : `${formatPercent(finance.staffShare)} de los gastos`
                }
              />
            </div>

            {finance.unconfirmedMinor > 0 && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                {money(finance.unconfirmedMinor)} aún sin confirmar. Está
                incluido en los totales de arriba; confírmalo en cada archivo
                para estar seguro.
              </p>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Gastos por categoría</h3>
                {finance.byCategory.length === 0 ? (
                  <p className="text-sm text-muted">
                    Sin gastos en el periodo.
                  </p>
                ) : (
                  <HorizontalBars
                    ariaLabel={`Gastos por categoría en ${finance.currency}, ${range}`}
                    format={money}
                    items={finance.byCategory.map((c) => ({
                      label: categoryLabels[c.category],
                      value: c.totalMinor,
                      share: c.share,
                    }))}
                  />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">
                  Gastos vs. ingresos por semana
                </h3>
                <GroupedBarChart
                  ariaLabel={`Gastos e ingresos por semana en ${finance.currency}, ${range}`}
                  labels={finance.weekly.map((w) =>
                    formatShortDate(w.bucketStart),
                  )}
                  format={(v) => formatMoney(Math.round(v), finance.currency)}
                  series={[
                    {
                      name: 'Gastos',
                      color: 'var(--danger)',
                      values: finance.weekly.map((w) => w.expensesMinor),
                    },
                    {
                      name: 'Ingresos',
                      color: 'var(--success)',
                      values: finance.weekly.map((w) => w.incomeMinor),
                    },
                  ]}
                />
                <p className="text-xs text-muted">
                  Cada barra es una semana (empieza el día indicado).
                  {partialEdges &&
                    ' La primera semana empieza antes del periodo: solo cuentan los días dentro del rango.'}
                </p>
              </div>
            </div>

            <Link
              href={`/records?from=${period.from}&to=${period.to}`}
              className="self-start text-sm text-accent hover:underline"
            >
              Ver detalle en Análisis
            </Link>
          </div>
        );
      }}
    </DashboardSection>
  );
}
