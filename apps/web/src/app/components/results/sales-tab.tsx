'use client';

import type { Period } from '@org/shared';
import { bucketFor } from '@org/shared';
import Link from 'next/link';
import { useState } from 'react';
import { getSales } from '../../lib/files-api';
import { formatMoney, formatPeriod, formatShortDate } from '../../lib/format';
import { HorizontalBars, SeriesLineChart } from '../charts';
import {
  DashboardSection,
  Stat,
  useSection,
} from '../dashboard/dashboard-section';

export function SalesTab({
  period,
  refreshKey,
}: {
  period: Period;
  refreshKey: number;
}) {
  const state = useSection(() => getSales(period), [period.from, period.to], {
    refreshKey,
  });
  const [selected, setSelected] = useState(0);
  const range = formatPeriod(period.from, period.to);
  const bucket = bucketFor(period);

  return (
    <DashboardSection
      title="Reportes de ventas"
      subtitle={`Reportes que terminan en el periodo · ${range}`}
      state={state}
    >
      {(views) => {
        if (views.length === 0) {
          return (
            <div className="flex flex-col items-start gap-3 py-2 text-sm">
              <p className="text-muted">
                No hay reportes de ventas en este periodo. Aparecen cuando subes
                uno y se analiza.
              </p>
              <Link href="/upload" className="text-accent hover:underline">
                Subir un reporte de ventas
              </Link>
            </div>
          );
        }
        const view = views[Math.min(selected, views.length - 1)];
        const money = (minor: number) => formatMoney(minor, view.currency);
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
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <Stat
                label="Ventas totales"
                value={money(view.totalSalesMinor)}
              />
              <Stat label="Unidades vendidas" value={view.unitsSold} />
              <Stat
                label="Ticket promedio"
                value={
                  view.averageTicketMinor === null
                    ? '—'
                    : money(view.averageTicketMinor)
                }
                hint={
                  view.averageTicketMinor === null
                    ? 'los reportes no indican transacciones'
                    : undefined
                }
              />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Productos más vendidos</h3>
                {view.bestProducts.length === 0 ? (
                  <p className="text-sm text-muted">
                    Los reportes de este periodo no traen detalle por producto.
                  </p>
                ) : (
                  <HorizontalBars
                    ariaLabel={`Productos más vendidos en ${view.currency}, ${range}`}
                    format={money}
                    items={view.bestProducts.map((p) => ({
                      label: `${p.productName} × ${p.quantity}`,
                      value: p.totalMinor,
                      share:
                        view.totalSalesMinor > 0
                          ? p.totalMinor / view.totalSalesMinor
                          : 0,
                    }))}
                  />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">
                  Ventas por {bucket === 'day' ? 'día' : 'semana'}
                </h3>
                {view.series.length === 0 ? (
                  <p className="text-sm text-muted">
                    Sin ventas con fecha en este periodo.
                  </p>
                ) : (
                  <SeriesLineChart
                    ariaLabel={`Ventas por ${bucket === 'day' ? 'día' : 'semana'} en ${view.currency}, ${range}`}
                    labels={view.series.map((p) =>
                      formatShortDate(p.bucketStart),
                    )}
                    format={(v) => formatMoney(Math.round(v), view.currency)}
                    series={[
                      {
                        name: 'Ventas',
                        color: 'var(--success)',
                        values: view.series.map((p) => p.totalMinor),
                      },
                    ]}
                  />
                )}
              </div>
            </div>
          </div>
        );
      }}
    </DashboardSection>
  );
}
