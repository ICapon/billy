'use client';

import type { BankStatementsView, Period } from '@org/shared';
import Link from 'next/link';
import { useState } from 'react';
import { getBankStatements } from '../../lib/files-api';
import {
  consistencyLabels,
  formatMoney,
  formatPeriod,
  formatShortDate,
} from '../../lib/format';
import { GroupedBarChart, SeriesLineChart } from '../charts';
import {
  DashboardSection,
  Stat,
  useSection,
} from '../dashboard/dashboard-section';

function Gaps({ view }: { view: BankStatementsView }) {
  if (view.gaps.length === 0) return null;
  const money = (minor: number | null) =>
    formatMoney(minor ?? 0, view.currency);
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-warning/10 p-3 text-sm text-warning">
      <p className="font-medium">Posibles huecos entre estados de cuenta</p>
      <ul className="flex flex-col gap-1">
        {view.gaps.map((gap, i) => (
          <li key={`${gap.afterDocumentId}-${gap.beforeDocumentId}-${i}`}>
            {gap.kind === 'balance'
              ? `El saldo final (${money(gap.closingBalanceMinor)}) no coincide con el saldo inicial del siguiente estado (${money(gap.openingBalanceMinor)}).`
              : `Falta un estado de cuenta entre ${formatShortDate(gap.missingFrom ?? '')} y ${formatShortDate(gap.missingTo ?? '')}.`}
            {gap.accountIdentifier ? ` Cuenta ${gap.accountIdentifier}.` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BankStatementsTab({
  period,
  refreshKey,
}: {
  period: Period;
  refreshKey: number;
}) {
  const state = useSection(
    () => getBankStatements(period),
    [period.from, period.to],
    {
      refreshKey,
    },
  );
  const [selected, setSelected] = useState(0);
  const range = formatPeriod(period.from, period.to);

  return (
    <DashboardSection
      title="Estados de cuenta"
      subtitle={`Estados que terminan en el periodo · ${range}`}
      state={state}
    >
      {(views) => {
        if (views.length === 0) {
          return (
            <div className="flex flex-col items-start gap-3 py-2 text-sm">
              <p className="text-muted">
                No hay estados de cuenta en este periodo. Aparecen cuando subes
                un estado de cuenta y se analiza.
              </p>
              <Link href="/upload" className="text-accent hover:underline">
                Subir un estado de cuenta
              </Link>
            </div>
          );
        }
        const view = views[Math.min(selected, views.length - 1)];
        const money = (minor: number) => formatMoney(minor, view.currency);
        const last = view.statements[view.statements.length - 1];
        const deposits = view.statements.reduce(
          (a, s) => a + s.totalDepositsMinor,
          0,
        );
        const withdrawals = view.statements.reduce(
          (a, s) => a + s.totalWithdrawalsMinor,
          0,
        );
        const fees = view.statements.reduce((a, s) => a + s.totalFeesMinor, 0);

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
                    onClick={() => setSelected(i)}
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
                label="Saldo más reciente"
                value={money(last.closingBalanceMinor)}
                hint={`al ${formatShortDate(last.periodEnd)}`}
              />
              <Stat label="Depósitos" value={money(deposits)} />
              <Stat label="Retiros" value={money(withdrawals)} />
              <Stat label="Comisiones" value={money(fees)} />
            </div>

            <Gaps view={view} />

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Saldo en el tiempo</h3>
                <SeriesLineChart
                  ariaLabel={`Saldo al cierre de cada estado de cuenta en ${view.currency}, ${range}`}
                  labels={view.balanceSeries.map((p) =>
                    formatShortDate(p.date),
                  )}
                  format={(v) => formatMoney(Math.round(v), view.currency)}
                  series={[
                    {
                      name: 'Saldo',
                      color: 'var(--accent)',
                      values: view.balanceSeries.map((p) => p.balanceMinor),
                    },
                  ]}
                />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">
                  Depósitos vs. retiros por mes
                </h3>
                <GroupedBarChart
                  ariaLabel={`Depósitos y retiros por mes en ${view.currency}, ${range}`}
                  labels={view.flows.map((f) => formatShortDate(f.periodStart))}
                  format={(v) => formatMoney(Math.round(v), view.currency)}
                  series={[
                    {
                      name: 'Depósitos',
                      color: 'var(--success)',
                      values: view.flows.map((f) => f.depositsMinor),
                    },
                    {
                      name: 'Retiros',
                      color: 'var(--danger)',
                      values: view.flows.map((f) => f.withdrawalsMinor),
                    },
                  ]}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="border-b border-separator text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Periodo</th>
                    <th className="py-2 pr-3 font-medium">Cuenta</th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Saldo inicial
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Saldo final
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Depósitos
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Retiros
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Comisiones
                    </th>
                    <th className="py-2 text-right font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {view.statements.map((s) => (
                    <tr
                      key={s.documentId}
                      className="border-b border-separator last:border-0"
                    >
                      <td className="py-2 pr-3">
                        <Link
                          href={`/files/${s.fileId}`}
                          className="hover:text-accent"
                        >
                          {formatPeriod(s.periodStart, s.periodEnd)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-muted">
                        {s.accountIdentifier ?? '—'}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {money(s.openingBalanceMinor)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {money(s.closingBalanceMinor)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {money(s.totalDepositsMinor)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {money(s.totalWithdrawalsMinor)}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {money(s.totalFeesMinor)}
                      </td>
                      <td
                        className={`py-2 text-right ${s.consistency === 'inconsistent' ? 'text-warning' : 'text-muted'}`}
                        title={s.notes ?? undefined}
                      >
                        {consistencyLabels[s.consistency]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }}
    </DashboardSection>
  );
}
