import type { DocumentType } from '@org/shared';
import { documentTypeLabel } from '../lib/format';

export function DocumentTypeChip({
  type,
  manual = false,
}: {
  type: DocumentType | null;
  manual?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        type ? 'bg-accent/10 text-accent' : 'bg-default text-muted'
      }`}
      title={manual ? 'Tipo elegido por ti' : undefined}
    >
      {documentTypeLabel(type)}
      {manual && <span aria-label="elegido por ti">✎</span>}
    </span>
  );
}
