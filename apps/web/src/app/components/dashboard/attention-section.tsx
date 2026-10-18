'use client';

import Link from 'next/link';
import { getAttention } from '../../lib/files-api';
import { formatMoney } from '../../lib/format';
import { DashboardSection, useSection } from './dashboard-section';

export function AttentionSection({ refreshKey }: { refreshKey: number }) {
  const state = useSection(() => getAttention(), [], { refreshKey });

  return (
    <DashboardSection
      title="Qué necesita tu atención"
      subtitle="Pendientes actuales, sin importar el periodo"
      state={state}
    >
      {(a) => {
        const items = [
          {
            label: 'Archivos en revisión',
            count: a.needsReview,
            href: '/files?status=needs_review',
          },
          {
            label: 'Archivos fallidos',
            count: a.failed,
            href: '/files?status=failed',
          },
          {
            label: 'En cola por límite de costo',
            count: a.queuedLimit,
            href: '/files?status=queued_limit',
          },
          {
            label: 'Posibles duplicados',
            count: a.pendingDuplicates,
            href: '/files#duplicados',
          },
        ];
        const pending = items.filter((i) => i.count > 0);
        if (pending.length === 0 && a.unconfirmed.length === 0) {
          return (
            <p className="py-2 text-sm text-success">
              Todo en orden: no hay archivos por revisar, fallidos, en cola ni
              duplicados.
            </p>
          );
        }
        return (
          <div className="flex flex-col gap-3">
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {items.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    aria-label={`${item.label}: ${item.count}`}
                    className={`flex items-center justify-between gap-3 rounded-xl border border-separator px-3 py-2 text-sm hover:bg-default ${
                      item.count === 0 ? 'text-muted' : ''
                    }`}
                  >
                    <span>{item.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        item.count > 0
                          ? 'bg-warning/15 text-warning'
                          : 'bg-default'
                      }`}
                    >
                      {item.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {a.unconfirmed.length > 0 && (
              <p className="text-sm text-muted">
                Monto sin confirmar:{' '}
                <span className="font-medium text-foreground">
                  {a.unconfirmed
                    .map((u) => formatMoney(u.amountMinor, u.currency))
                    .join(' · ')}
                </span>
                . Está incluido en los totales.
              </p>
            )}
          </div>
        );
      }}
    </DashboardSection>
  );
}
