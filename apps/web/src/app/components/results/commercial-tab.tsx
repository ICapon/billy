'use client';

import type { CommercialView, Period } from '@org/shared';
import Link from 'next/link';
import { useState } from 'react';
import { getCommercial, listFiles } from '../../lib/files-api';
import { formatMoney, formatPeriod } from '../../lib/format';
import { HorizontalBars } from '../charts';
import {
  DashboardSection,
  Stat,
  useSection,
} from '../dashboard/dashboard-section';

/** Files the system could not classify, so the owner can set their type. */
function OtherDocuments({ refreshKey }: { refreshKey: number }) {
  const state = useSection(
    () => listFiles({ documentType: 'other', limit: 10 }),
    [],
    { refreshKey },
  );
  return (
    <DashboardSection
      title="Otros documentos"
      subtitle="No se reconocieron como factura, recibo, nómina, estado de cuenta ni reporte de ventas"
      state={state}
    >
      {(page) =>
        page.items.length === 0 ? (
          <p className="text-sm text-muted">
            No hay documentos sin tipo reconocido.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {page.items.map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between gap-3"
              >
                <span className="truncate">{file.originalName}</span>
                <Link
                  href={`/files/${file.id}`}
                  className="shrink-0 text-accent hover:underline"
                >
                  Elegir tipo
                </Link>
              </li>
            ))}
          </ul>
        )
      }
    </DashboardSection>
  );
}

const kindLabels = { invoice: 'Facturas', receipt: 'Recibos' } as const;

export function CommercialTab({
  period,
  refreshKey,
}: {
  period: Period;
  refreshKey: number;
}) {
  const state = useSection(
    () => getCommercial(period),
    [period.from, period.to],
    { refreshKey },
  );
  const [kind, setKind] = useState<'invoice' | 'receipt'>('invoice');
  const [currency, setCurrency] = useState<string | null>(null);
  const range = formatPeriod(period.from, period.to);

  return (
    <div className="flex flex-col gap-6">
      <DashboardSection
        title="Facturas y recibos"
        subtitle={`Por fecha de emisión · ${range}`}
        state={state}
      >
        {(views) => {
          const currencies = [...new Set(views.map((v) => v.currency))];
          const active =
            currency && currencies.includes(currency)
              ? currency
              : currencies[0];
          const view: CommercialView | undefined = views.find(
            (v) => v.currency === active && v.kind === kind,
          );
          const money = (minor: number) => formatMoney(minor, active ?? 'USD');

          if (views.length === 0) {
            return (
              <div className="flex flex-col items-start gap-3 py-2 text-sm">
                <p className="text-muted">
                  No hay facturas ni recibos en este periodo. Aparecen cuando
                  subes uno y se analiza.
                </p>
                <Link href="/upload" className="text-accent hover:underline">
                  Subir una factura
                </Link>
              </div>
            );
          }
          return (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-3">
                <div
                  className="flex overflow-hidden rounded-lg border border-separator"
                  role="group"
                  aria-label="Tipo"
                >
                  {(['invoice', 'receipt'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={kind === value}
                      onClick={() => setKind(value)}
                      className={`px-3 py-1.5 text-sm ${
                        kind === value
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-default'
                      }`}
                    >
                      {kindLabels[value]}
                    </button>
                  ))}
                </div>
                {currencies.length > 1 && (
                  <div
                    className="flex gap-2"
                    role="tablist"
                    aria-label="Moneda"
                  >
                    {currencies.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="tab"
                        aria-selected={c === active}
                        onClick={() => setCurrency(c)}
                        className={`rounded-lg border border-separator px-3 py-1 text-sm ${
                          c === active
                            ? 'bg-accent text-accent-foreground'
                            : 'hover:bg-default'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!view ? (
                <p className="text-sm text-muted">
                  No hay {kindLabels[kind].toLowerCase()} en este periodo.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                    <Stat label="Documentos" value={view.documents} />
                    <Stat label="Total" value={money(view.totalMinor)} />
                    <Stat
                      label="Impuestos"
                      value={money(view.taxMinor)}
                      hint="solo documentos que los indican"
                    />
                    <Stat
                      label="Pagado"
                      value={money(view.paidMinor)}
                      tone="success"
                    />
                    <Stat
                      label="Pendiente"
                      value={money(view.pendingMinor)}
                      tone={view.pendingMinor > 0 ? 'warning' : undefined}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium">
                      Principales contrapartes
                    </h3>
                    {view.topCounterparties.length === 0 ? (
                      <p className="text-sm text-muted">
                        Ningún documento indica contraparte.
                      </p>
                    ) : (
                      <HorizontalBars
                        ariaLabel={`Principales contrapartes en ${view.currency}, ${range}`}
                        format={money}
                        items={view.topCounterparties.map((c) => ({
                          label: `${c.counterparty} (${c.documents})`,
                          value: c.totalMinor,
                          share:
                            view.totalMinor > 0
                              ? c.totalMinor / view.totalMinor
                              : 0,
                        }))}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          );
        }}
      </DashboardSection>
      <OtherDocuments refreshKey={refreshKey} />
    </div>
  );
}
