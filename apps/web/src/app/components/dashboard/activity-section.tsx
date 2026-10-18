'use client';

import type { Period } from '@org/shared';
import Link from 'next/link';
import { getActivity } from '../../lib/files-api';
import {
  formatDuration,
  formatPeriod,
  formatPercent,
  formatShortDate,
} from '../../lib/format';
import { SeriesLineChart } from '../charts';
import { DashboardSection, Stat, useSection } from './dashboard-section';

const POLL_MS = 10_000;

export function ActivitySection({
  period,
  refreshKey,
}: {
  period: Period;
  refreshKey: number;
}) {
  const state = useSection(
    () => getActivity(period),
    [period.from, period.to],
    {
      refreshKey,
      pollMs: POLL_MS,
      // keep refreshing while some file is still being analyzed or waiting for budget
      pollWhen: (d) =>
        d.counts.received + d.counts.processing + d.counts.queuedLimit > 0,
    },
  );
  const range = formatPeriod(period.from, period.to);

  return (
    <DashboardSection
      title="Actividad de análisis"
      subtitle={`Archivos subidos · ${range}`}
      state={state}
    >
      {(a) =>
        a.total === 0 ? (
          <div className="flex flex-col items-start gap-3 py-2 text-sm">
            <p className="text-muted">
              Aún no hay archivos en este periodo. El dashboard se llena a
              medida que se analizan tus documentos.
            </p>
            <Link href="/upload" className="text-accent hover:underline">
              Subir mi primer archivo
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
              <Stat
                label="Archivos recibidos"
                value={a.total}
                hint={`en ${range}`}
              />
              <Stat
                label="En proceso"
                value={a.counts.received + a.counts.processing}
                hint="recibidos o analizando"
              />
              <Stat label="En cola por límite" value={a.counts.queuedLimit} />
              <Stat
                label="Completados"
                value={a.counts.completed}
                tone="success"
              />
              <Stat
                label="En revisión"
                value={a.counts.needsReview}
                tone="warning"
              />
              <Stat label="Fallidos" value={a.counts.failed} tone="danger" />
              <Stat
                label="Tasa de éxito"
                value={
                  a.successRate === null ? '—' : formatPercent(a.successRate)
                }
                hint={
                  a.finished > 0
                    ? `de ${a.finished} terminados`
                    : 'aún sin terminar'
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Stat
                label="Tiempo medio de análisis"
                value={
                  a.avgAnalysisSeconds === null
                    ? '—'
                    : formatDuration(a.avgAnalysisSeconds)
                }
                hint="por archivo analizado"
              />
              <Stat
                label="Método de lectura"
                value={`${a.byMethod.digital} directa · ${a.byMethod.ocr} OCR · ${a.byMethod.vision} IA`}
                hint="archivos ya leídos"
              />
            </div>
            <SeriesLineChart
              ariaLabel={`Archivos subidos y analizados por ${a.bucket === 'day' ? 'día' : 'semana'}, ${range}`}
              labels={a.series.map((p) => formatShortDate(p.bucketStart))}
              series={[
                {
                  name: 'Subidos',
                  color: 'var(--accent)',
                  values: a.series.map((p) => p.uploaded),
                },
                {
                  name: 'Analizados',
                  color: 'var(--success)',
                  values: a.series.map((p) => p.finished),
                },
              ]}
              format={(v) => String(Math.round(v))}
            />
            {a.bucket === 'week' && (
              <p className="text-xs text-muted">
                Cada punto es una semana (empieza el día indicado); las de los
                extremos pueden ser parciales.
              </p>
            )}
          </div>
        )
      }
    </DashboardSection>
  );
}
