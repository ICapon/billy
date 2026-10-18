import type { FileStatus } from '@org/shared';
import { statusClasses, statusLabels } from '../lib/format';

export function StatusChip({ status }: { status: FileStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClasses[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}
