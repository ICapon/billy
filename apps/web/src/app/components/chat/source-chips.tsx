import type { SourceRef } from '@org/shared';
import Link from 'next/link';
import { formatShortDate, documentTypeLabel } from '../../lib/format';

function periodLabel(source: SourceRef): string | null {
  if (source.periodStart && source.periodEnd) {
    return source.periodStart === source.periodEnd
      ? formatShortDate(source.periodEnd)
      : `${formatShortDate(source.periodStart)} – ${formatShortDate(source.periodEnd)}`;
  }
  const single = source.periodEnd ?? source.periodStart;
  return single ? formatShortDate(single) : null;
}

/** The documents an answer was based on; each opens the file detail. */
export function SourceChips({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-1">
      <span className="text-xs text-muted">Fuentes</span>
      <ul className="flex flex-wrap gap-2">
        {sources.map((source) => {
          const period = periodLabel(source);
          const detail = (
            <>
              <span className="max-w-48 truncate font-medium">
                {source.name}
              </span>
              <span className="text-muted">
                {documentTypeLabel(source.documentType)}
                {period ? ` · ${period}` : ''}
              </span>
            </>
          );
          return (
            <li key={source.fileId}>
              {source.available ? (
                <Link
                  href={`/files/${source.fileId}`}
                  className="flex items-center gap-2 rounded-lg border border-separator px-2.5 py-1 text-xs hover:bg-default"
                >
                  {detail}
                </Link>
              ) : (
                <span
                  title="Este archivo ya no existe"
                  className="flex items-center gap-2 rounded-lg border border-separator px-2.5 py-1 text-xs text-muted line-through"
                >
                  {detail}
                  <span className="no-underline">(no disponible)</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
