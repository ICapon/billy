'use client';

import { Card } from '@heroui/react';
import type { CostSummary } from '@org/shared';
import { useEffect, useState } from 'react';
import { getCostSummary } from '../lib/files-api';
import { formatCost } from '../lib/format';

/** Monthly analysis cost, the optional limit and how many files were read without paid AI. */
export function CostBanner() {
  const [summary, setSummary] = useState<CostSummary | null>(null);

  useEffect(() => {
    getCostSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  if (!summary) return null;

  const files = Object.values(summary.byTier).reduce((a, b) => a + b, 0);
  const cheap = summary.byTier.digital + summary.byTier.ocr;
  const cheapShare = files > 0 ? Math.round((cheap / files) * 100) : null;

  return (
    <Card>
      <Card.Content className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-muted">Costo de análisis este mes</p>
          <p className="text-lg font-semibold">
            {formatCost(summary.totalMicroUsd)}
            {summary.limitMicroUsd !== null && (
              <span className="text-sm font-normal text-muted">
                {' '}
                de {formatCost(summary.limitMicroUsd)}
              </span>
            )}
          </p>
        </div>
        <p className="text-xs text-muted">
          Promedio por archivo: {formatCost(summary.avgPerFileMicroUsd)}
          {cheapShare !== null &&
            ` · ${cheapShare}% de los archivos se leyeron sin IA de pago (lectura directa u OCR)`}
        </p>
        {summary.limitReached && (
          <p
            role="alert"
            className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning"
          >
            Se alcanzó el límite mensual. Los archivos nuevos se guardan como
            «En cola (límite alcanzado)» y se analizan al aumentar el límite o
            al empezar el mes siguiente.
          </p>
        )}
      </Card.Content>
    </Card>
  );
}
