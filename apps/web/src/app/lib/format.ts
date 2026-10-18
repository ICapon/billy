import type { FileStatus, TransactionCategory } from '@org/shared';

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** Cost is stored in micro-USD. */
export function formatCost(microUsd: number): string {
  if (microUsd === 0) return '$0';
  const usd = microUsd / 1_000_000;
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

export const statusLabels: Record<FileStatus, string> = {
  received: 'Recibido',
  queued_limit: 'En cola (límite alcanzado)',
  processing: 'Procesando',
  completed: 'Completado',
  needs_review: 'Requiere revisión',
  failed: 'Falló',
};

export const statusClasses: Record<FileStatus, string> = {
  received: 'bg-default text-foreground',
  queued_limit: 'bg-warning/15 text-warning',
  processing: 'bg-accent/15 text-accent',
  completed: 'bg-success/15 text-success',
  needs_review: 'bg-warning/15 text-warning',
  failed: 'bg-danger/15 text-danger',
};

export const readingMethodLabels = {
  digital: 'Lectura directa',
  ocr: 'OCR',
  vision: 'Visión (IA)',
} as const;

/** Statuses that will still change without user action. */
export function isInProgress(status: FileStatus): boolean {
  return (
    status === 'received' ||
    status === 'processing' ||
    status === 'queued_limit'
  );
}

export const categoryLabels: Record<TransactionCategory, string> = {
  supplies: 'Insumos',
  inventory: 'Inventario',
  rent: 'Alquiler',
  utilities: 'Servicios',
  staff: 'Personal',
  transport: 'Transporte',
  marketing: 'Marketing',
  taxes: 'Impuestos',
  equipment: 'Equipamiento',
  sales: 'Ventas',
  services: 'Servicios prestados',
  other: 'Otros',
};

export function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es', { style: 'currency', currency }).format(
      amountMinor / 100,
    );
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

const UTC_SHORT = { day: 'numeric', month: 'short', timeZone: 'UTC' } as const;

/** "12 oct" for a bucket start (UTC date). */
export function formatShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('es', UTC_SHORT);
}

/** "18 sep – 18 oct 2026" */
export function formatPeriod(from: string, to: string): string {
  const year = new Date(`${to}T00:00:00Z`).getUTCFullYear();
  return `${formatShortDate(from)} – ${formatShortDate(to)} ${year}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  }
  const hours = Math.floor(seconds / 3600);
  return `${hours} h ${Math.round((seconds % 3600) / 60)} min`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)} %`;
}

export const limitReachedMessage =
  'Se alcanzó el límite mensual. Los archivos nuevos se guardan como «En cola (límite alcanzado)» y se analizan al aumentar el límite o al empezar el mes siguiente.';
