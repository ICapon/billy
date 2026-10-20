'use client';

import { Button } from '@heroui/react';
import type { ReanalyzeEstimate } from '@org/shared';
import { useEffect, useState } from 'react';
import { getReanalyzeEstimate, reanalyzeAll } from '../lib/files-api';
import { formatEstimate } from '../lib/format';

export const FILES_CHANGED_EVENT = 'billy:files-changed';

/**
 * Asks to re-analyze every file that has no document type. It shows the file count, a rough
 * cost and the budget left before anything starts, because re-reading can use paid analysis.
 */
export function ReanalyzeBanner() {
  const [estimate, setEstimate] = useState<ReanalyzeEstimate | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    getReanalyzeEstimate()
      .then(setEstimate)
      .catch(() => setEstimate(null));
  };
  useEffect(refresh, []);

  if (!estimate || estimate.files === 0) return null;

  const overBudget =
    estimate.remainingMicroUsd !== null &&
    estimate.estimatedMicroUsd > estimate.remainingMicroUsd;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await reanalyzeAll();
      setOpen(false);
      refresh();
      // the files list listens to this and reloads
      window.dispatchEvent(new Event(FILES_CHANGED_EVENT));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo iniciar el re-análisis',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-separator bg-surface p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          <span className="font-medium">
            {estimate.files} archivos sin clasificar.
          </span>{' '}
          <span className="text-muted">
            Se analizaron antes de que existieran los tipos de documento.
          </span>
        </p>
        {!open && (
          <Button size="sm" onPress={() => setOpen(true)}>
            Re-analizar todos
          </Button>
        )}
      </div>
      {open && (
        <div
          role="dialog"
          aria-label="Confirmar re-análisis"
          className="flex flex-col gap-3"
        >
          <p>
            Se volverán a leer <strong>{estimate.files}</strong> archivos. Costo
            estimado:{' '}
            <strong>{formatEstimate(estimate.estimatedMicroUsd)}</strong>
            {estimate.remainingMicroUsd !== null && (
              <>
                {' '}
                · presupuesto restante del mes:{' '}
                {formatEstimate(estimate.remainingMicroUsd)}
              </>
            )}
            . Puede usar análisis de pago.
          </p>
          {overBudget && (
            <p
              role="alert"
              className="rounded-lg bg-warning/10 px-3 py-2 text-warning"
            >
              El estimado supera el presupuesto restante: algunos archivos
              quedarán «En cola (límite alcanzado)» hasta que subas el límite o
              empiece el mes siguiente.
            </p>
          )}
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              isDisabled={busy}
              onPress={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button size="sm" isDisabled={busy} onPress={() => void start()}>
              {busy ? 'Iniciando…' : 'Confirmar y re-analizar'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
