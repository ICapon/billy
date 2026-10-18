'use client';

import { getCostSummary } from '../../lib/files-api';
import {
  formatCost,
  formatPercent,
  limitReachedMessage,
} from '../../lib/format';
import { DashboardSection, Stat, useSection } from './dashboard-section';

export function CostSection({ refreshKey }: { refreshKey: number }) {
  const state = useSection(() => getCostSummary(), [], { refreshKey });

  return (
    <DashboardSection
      title="Costo del análisis"
      subtitle="Este mes (UTC), sin importar el periodo"
      state={state}
    >
      {(c) => {
        const files = c.byTier.digital + c.byTier.ocr + c.byTier.vision;
        const share = (n: number) =>
          files > 0 ? formatPercent(n / files) : '—';
        const used = c.limitMicroUsd
          ? Math.min(c.totalMicroUsd / c.limitMicroUsd, 1)
          : null;
        return (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Stat
                label="Costo del mes"
                value={formatCost(c.totalMicroUsd)}
                hint={
                  c.limitMicroUsd !== null
                    ? `límite ${formatCost(c.limitMicroUsd)}`
                    : 'sin límite'
                }
              />
              <Stat
                label="Promedio por archivo"
                value={formatCost(c.avgPerFileMicroUsd)}
              />
            </div>
            {used !== null && (
              <div
                className="h-2 overflow-hidden rounded-full bg-default"
                role="progressbar"
                aria-label="Uso del límite mensual"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(used * 100)}
              >
                <div
                  className={`h-full ${c.limitReached ? 'bg-danger' : 'bg-accent'}`}
                  style={{ width: `${used * 100}%` }}
                />
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 text-sm">
              <Stat label="Lectura directa" value={share(c.byTier.digital)} />
              <Stat label="OCR" value={share(c.byTier.ocr)} />
              <Stat label="IA (visión)" value={share(c.byTier.vision)} />
            </div>
            <p className="text-xs text-muted">
              Reparto de los archivos ya leídos. Lectura directa y OCR no tienen
              costo de IA.
            </p>
            {c.limitReached && (
              <p
                role="alert"
                className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning"
              >
                {limitReachedMessage}
              </p>
            )}
          </div>
        );
      }}
    </DashboardSection>
  );
}
