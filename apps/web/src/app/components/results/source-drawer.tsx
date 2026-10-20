'use client';

import {
  documentTypes,
  type DocumentType,
  type Transaction,
} from '@org/shared';
import Link from 'next/link';
import { useState } from 'react';
import { getRecords } from '../../lib/files-api';
import {
  categoryLabels,
  documentTypeLabels,
  formatMoney,
} from '../../lib/format';
import { DashboardSection, useSection } from '../dashboard/dashboard-section';

export interface SourceScope {
  title: string;
  from?: string;
  to?: string;
  kind?: Transaction['kind'];
  documentType?: DocumentType;
  documentId?: string;
}

/** The records behind a figure, each linking to the file it came from, with their total. */
export function SourceDrawer({
  scope,
  onClose,
}: {
  scope: SourceScope;
  onClose: () => void;
}) {
  const [type, setType] = useState<DocumentType | ''>(scope.documentType ?? '');
  const state = useSection(
    () => getRecords({ ...scope, documentType: type || undefined, limit: 100 }),
    [scope.from, scope.to, scope.kind, scope.documentId, type],
  );

  return (
    <section
      role="dialog"
      aria-label={`Registros de ${scope.title}`}
      className="flex flex-col gap-3 rounded-xl border border-separator p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium">Registros de {scope.title}</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-muted">
            Tipo de documento
            <select
              value={type}
              onChange={(e) => setType(e.target.value as DocumentType | '')}
              className="rounded-lg border border-separator bg-surface px-2 py-1 text-foreground"
            >
              <option value="">Todos</option>
              {documentTypes.map((value) => (
                <option key={value} value={value}>
                  {documentTypeLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onClose}
            className="text-accent hover:underline"
          >
            Cerrar
          </button>
        </div>
      </div>
      <DashboardSection title="" state={state}>
        {(page) => {
          if (page.items.length === 0) {
            return (
              <p className="text-muted">No hay registros para este filtro.</p>
            );
          }
          const totals = new Map<string, number>();
          for (const r of page.items) {
            totals.set(
              r.currency,
              (totals.get(r.currency) ?? 0) + r.amountMinor,
            );
          }
          return (
            <div className="flex flex-col gap-2">
              <ul className="flex flex-col gap-1.5">
                {page.items.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0 truncate">
                      {r.occurredOn} ·{' '}
                      {r.counterparty ?? categoryLabels[r.category]}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      {formatMoney(r.amountMinor, r.currency)}
                      <Link
                        href={`/files/${r.fileId}`}
                        className="text-accent hover:underline"
                      >
                        Ver archivo
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="font-medium">
                Total:{' '}
                {[...totals]
                  .map(([currency, minor]) => formatMoney(minor, currency))
                  .join(' · ')}
                {page.nextCursor && (
                  <span className="font-normal text-muted">
                    {' '}
                    (primeros {page.items.length})
                  </span>
                )}
              </p>
            </div>
          );
        }}
      </DashboardSection>
    </section>
  );
}
