'use client';

import { Button, Card } from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface SectionState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads one dashboard section on its own. It reloads when `deps` or `refreshKey` change, keeps
 * showing the previous data while new data loads, ignores stale answers, and (optionally) polls
 * while the tab is visible and `pollWhen` says there is still work in progress.
 */
export function useSection<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
  options: {
    refreshKey?: number;
    pollMs?: number;
    pollWhen?: (data: T) => boolean;
  } = {},
): SectionState<T> {
  const { refreshKey = 0, pollMs, pollWhen } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async (silent: boolean) => {
    const id = ++latest.current;
    if (!silent) setLoading(true);
    try {
      const result = await loaderRef.current();
      if (id !== latest.current) return;
      setData(result);
      setError(null);
    } catch (e) {
      if (id !== latest.current) return;
      setError(
        e instanceof Error ? e.message : 'No se pudieron cargar los datos',
      );
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => void run(false), [run, refreshKey, ...deps]);

  const shouldPoll = !!pollMs && !!data && (pollWhen ? pollWhen(data) : true);
  useEffect(() => {
    if (!shouldPoll || !pollMs) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void run(true);
    }, pollMs);
    return () => clearInterval(timer);
  }, [shouldPoll, pollMs, run]);

  return { data, error, loading, reload: () => void run(false) };
}

export function DashboardSection<T>({
  title,
  subtitle,
  state,
  children,
  className = '',
}: {
  title: string;
  /** Unit and period of the figures (FR-016) */
  subtitle?: string;
  state: SectionState<T>;
  children: (data: T) => React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <Card.Header>
        <div className="flex flex-col gap-0.5">
          <Card.Title>{title}</Card.Title>
          {subtitle && <span className="text-xs text-muted">{subtitle}</span>}
        </div>
      </Card.Header>
      <Card.Content>
        {state.error && !state.data ? (
          <div role="alert" className="flex flex-col items-start gap-3 text-sm">
            <p className="text-danger">{state.error}</p>
            <Button size="sm" variant="secondary" onPress={state.reload}>
              Reintentar
            </Button>
          </div>
        ) : state.data ? (
          <div className="flex flex-col gap-3">
            {state.error && (
              <p
                role="alert"
                className="flex items-center gap-3 text-xs text-warning"
              >
                No se pudo actualizar; se muestran los últimos datos.
                <button
                  type="button"
                  className="underline"
                  onClick={state.reload}
                >
                  Reintentar
                </button>
              </p>
            )}
            <div
              className={
                state.loading ? 'opacity-60 transition-opacity' : undefined
              }
            >
              {children(state.data)}
            </div>
          </div>
        ) : (
          <div
            className="flex flex-col gap-3"
            aria-busy="true"
            aria-label="Cargando"
          >
            <div className="h-6 w-1/3 animate-pulse rounded bg-default" />
            <div className="h-24 animate-pulse rounded bg-default" />
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'success' | 'warning' | 'danger';
}) {
  const color =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'danger'
          ? 'text-danger'
          : '';
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      <span className={`truncate text-xl font-semibold ${color}`}>{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
