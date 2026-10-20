'use client';

import type { Period, PayrollView } from '@org/shared';
import Link from 'next/link';
import { useState } from 'react';
import {
  getEmployeeHistory,
  getPayroll,
  getPayrollLines,
} from '../../lib/files-api';
import {
  consistencyLabels,
  formatMoney,
  formatPeriod,
  formatShortDate,
} from '../../lib/format';
import { GroupedBarChart } from '../charts';
import {
  DashboardSection,
  Stat,
  useSection,
} from '../dashboard/dashboard-section';

type PayrollPeriod = PayrollView['periods'][number];

function PeriodDetail({
  period,
  currency,
}: {
  period: PayrollPeriod;
  currency: string;
}) {
  const money = (minor: number) => formatMoney(minor, currency);
  const [employeeKey, setEmployeeKey] = useState<string | null>(null);
  const lines = useSection(
    () => getPayrollLines(period.documentId),
    [period.documentId],
  );
  const history = useSection(
    () =>
      employeeKey ? getEmployeeHistory(employeeKey) : Promise.resolve(null),
    [employeeKey],
  );

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-separator p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          Empleados · {formatPeriod(period.periodStart, period.periodEnd)}
        </h3>
        <Link
          href={`/files/${period.fileId}`}
          className="text-sm text-accent hover:underline"
        >
          Ver archivo
        </Link>
      </div>
      <DashboardSection title="Detalle por empleado" state={lines}>
        {(rows) => (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="border-b border-separator text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Empleado</th>
                  <th className="py-2 pr-3 text-right font-medium">Bruto</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    Deducciones
                  </th>
                  <th className="py-2 text-right font-medium">Neto</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((line) => (
                  <tr
                    key={line.employeeKey}
                    className="border-b border-separator last:border-0"
                  >
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        className="text-left hover:text-accent"
                        onClick={() => setEmployeeKey(line.employeeKey)}
                      >
                        {line.employeeName}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {money(line.grossMinor)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {money(line.deductionsMinor)}
                    </td>
                    <td className="py-2 text-right">{money(line.netMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardSection>
      {employeeKey && (
        <DashboardSection
          title="Historial de pago"
          subtitle={history.data?.employeeName}
          state={history}
        >
          {(value) =>
            value && (
              <ul className="flex flex-col gap-1.5 text-sm">
                {value.history.map((h) => (
                  <li key={h.documentId} className="flex justify-between gap-3">
                    <span className="text-muted">
                      {formatPeriod(h.periodStart, h.periodEnd)}
                    </span>
                    <span>
                      bruto {formatMoney(h.grossMinor, h.currency)} · neto{' '}
                      {formatMoney(h.netMinor, h.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        </DashboardSection>
      )}
    </div>
  );
}

export function PayrollTab({
  period,
  refreshKey,
}: {
  period: Period;
  refreshKey: number;
}) {
  const state = useSection(() => getPayroll(period), [period.from, period.to], {
    refreshKey,
  });
  const [selected, setSelected] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const range = formatPeriod(period.from, period.to);

  return (
    <DashboardSection
      title="Nóminas"
      subtitle={`Periodos de pago que terminan en el rango · ${range}`}
      state={state}
    >
      {(views) => {
        if (views.length === 0) {
          return (
            <div className="flex flex-col items-start gap-3 py-2 text-sm">
              <p className="text-muted">
                No hay nóminas en este periodo. Aparecen cuando subes una nómina
                y se analiza.
              </p>
              <Link href="/upload" className="text-accent hover:underline">
                Subir una nómina
              </Link>
            </div>
          );
        }
        const view = views[Math.min(selected, views.length - 1)];
        const money = (minor: number) => formatMoney(minor, view.currency);
        const total = (pick: (p: PayrollPeriod) => number) =>
          view.periods.reduce((acc, p) => acc + pick(p), 0);
        const open = view.periods.find((p) => p.documentId === openId);

        return (
          <div className="flex flex-col gap-5">
            {views.length > 1 && (
              <div className="flex gap-2" role="tablist" aria-label="Moneda">
                {views.map((v, i) => (
                  <button
                    key={v.currency}
                    type="button"
                    role="tab"
                    aria-selected={i === selected}
                    onClick={() => {
                      setSelected(i);
                      setOpenId(null);
                    }}
                    className={`rounded-lg border border-separator px-3 py-1 text-sm ${
                      i === selected
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-default'
                    }`}
                  >
                    {v.currency}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat
                label="Costo total"
                value={money(total((p) => p.totalCostMinor))}
                hint="igual al gasto en personal"
              />
              <Stat
                label="Pago bruto"
                value={money(total((p) => p.grossMinor))}
              />
              <Stat
                label="Deducciones"
                value={money(total((p) => p.deductionsMinor))}
              />
              <Stat label="Pago neto" value={money(total((p) => p.netMinor))} />
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">
                Costo, bruto y neto por periodo
              </h3>
              <GroupedBarChart
                ariaLabel={`Costo total, pago bruto y pago neto por periodo en ${view.currency}, ${range}`}
                labels={view.periods.map((p) => formatShortDate(p.periodEnd))}
                format={(v) => formatMoney(Math.round(v), view.currency)}
                series={[
                  {
                    name: 'Costo total',
                    color: 'var(--danger)',
                    values: view.periods.map((p) => p.totalCostMinor),
                  },
                  {
                    name: 'Bruto',
                    color: 'var(--accent)',
                    values: view.periods.map((p) => p.grossMinor),
                  },
                  {
                    name: 'Neto',
                    color: 'var(--success)',
                    values: view.periods.map((p) => p.netMinor),
                  },
                ]}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-separator text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Periodo</th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Empleados
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">Bruto</th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Deducciones
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">Neto</th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Costo total
                    </th>
                    <th className="py-2 text-right font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {view.periods.map((p) => (
                    <tr
                      key={p.documentId}
                      className="border-b border-separator last:border-0"
                    >
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          aria-expanded={openId === p.documentId}
                          className="text-left hover:text-accent"
                          onClick={() =>
                            setOpenId(
                              openId === p.documentId ? null : p.documentId,
                            )
                          }
                        >
                          {formatPeriod(p.periodStart, p.periodEnd)}
                        </button>
                      </td>
                      <td className="py-2 pr-3 text-right">{p.employees}</td>
                      <td className="py-2 pr-3 text-right">
                        {money(p.grossMinor)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {money(p.deductionsMinor)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {money(p.netMinor)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {money(p.totalCostMinor)}
                      </td>
                      <td
                        className={`py-2 text-right ${p.consistency === 'inconsistent' ? 'text-warning' : 'text-muted'}`}
                      >
                        {consistencyLabels[p.consistency]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {open && <PeriodDetail period={open} currency={view.currency} />}
          </div>
        );
      }}
    </DashboardSection>
  );
}
