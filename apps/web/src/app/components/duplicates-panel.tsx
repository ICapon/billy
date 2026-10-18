'use client';

import { Button, Card } from '@heroui/react';
import type { DuplicateCandidate, Transaction } from '@org/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { listDuplicates, resolveDuplicate } from '../lib/files-api';
import { categoryLabels, formatMoney } from '../lib/format';

function RecordSummary({
  record,
  label,
}: {
  record: Transaction;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-default p-3 text-sm">
      <span className="text-xs uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="text-base font-semibold">
        {formatMoney(record.amountMinor, record.currency)}
      </span>
      <span>
        {record.occurredOn} · {record.counterparty ?? 'Sin contraparte'}
      </span>
      <span className="text-muted">{categoryLabels[record.category]}</span>
      <Link
        href={`/files/${record.fileId}`}
        className="text-accent hover:underline"
      >
        Ver archivo
      </Link>
    </div>
  );
}

/** Pairs of records that look like the same transaction in two files. Nothing is merged until the owner decides. */
export function DuplicatesPanel() {
  const [pairs, setPairs] = useState<DuplicateCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPairs(await listDuplicates());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudieron cargar los duplicados',
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (
    id: string,
    body: Parameters<typeof resolveDuplicate>[1],
  ) => {
    setBusyId(id);
    setError(null);
    try {
      await resolveDuplicate(id, body);
      setPairs((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo resolver el duplicado',
      );
    } finally {
      setBusyId(null);
    }
  };

  if (pairs.length === 0 && !error) return null;

  return (
    <div id="duplicados">
      <Card>
        <Card.Header>
          <Card.Title>Posibles duplicados ({pairs.length})</Card.Title>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Estos registros de archivos distintos tienen la misma fecha, monto y
            contraparte. Si son la misma operación, fusiónalos para que cuente
            una sola vez.
          </p>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {pairs.map((pair) => (
            <div
              key={pair.id}
              className="flex flex-col gap-3 rounded-xl border border-separator p-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <RecordSummary record={pair.a} label="Registro A" />
                <RecordSummary record={pair.b} label="Registro B" />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={busyId === pair.id}
                  onPress={() => void resolve(pair.id, { action: 'keep_both' })}
                >
                  Conservar ambos
                </Button>
                <Button
                  size="sm"
                  isDisabled={busyId === pair.id}
                  onPress={() =>
                    void resolve(pair.id, {
                      action: 'merge',
                      keepTransactionId: pair.a.id,
                    })
                  }
                >
                  Fusionar (conservar A)
                </Button>
                <Button
                  size="sm"
                  isDisabled={busyId === pair.id}
                  onPress={() =>
                    void resolve(pair.id, {
                      action: 'merge',
                      keepTransactionId: pair.b.id,
                    })
                  }
                >
                  Fusionar (conservar B)
                </Button>
              </div>
            </div>
          ))}
        </Card.Content>
      </Card>
    </div>
  );
}
