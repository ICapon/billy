'use client';

import { Button, Card } from '@heroui/react';
import type { BusinessFileDetail } from '@org/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { downloadUrl, getFile, retryFile } from '../lib/files-api';
import { RecordEditor } from './record-editor';
import {
  formatCost,
  formatDateTime,
  formatSize,
  isInProgress,
  readingMethodLabels,
} from '../lib/format';
import { StatusChip } from './status-chip';

const POLL_MS = 3000;

export function FileDetail({ id }: { id: string }) {
  const [file, setFile] = useState<BusinessFileDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    try {
      setFile(await getFile(id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el archivo');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const polling = file ? isInProgress(file.status) : false;
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [polling, load]);

  const retry = async () => {
    setRetrying(true);
    try {
      await retryFile(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reintentar');
    } finally {
      setRetrying(false);
    }
  };

  if (error && !file) {
    return (
      <p
        role="alert"
        className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger"
      >
        {error}
      </p>
    );
  }
  if (!file) return <p className="text-sm text-muted">Cargando…</p>;

  const canRetry = file.status === 'failed' || file.status === 'needs_review';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/files"
            className="text-sm text-muted hover:text-foreground"
          >
            ← Archivos
          </Link>
          <h1 className="truncate text-2xl font-semibold">
            {file.originalName}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <a href={downloadUrl(file.id)}>
            <Button variant="secondary">Descargar original</Button>
          </a>
          {canRetry && (
            <Button isDisabled={retrying} onPress={() => void retry()}>
              {retrying ? 'Reintentando…' : 'Reintentar análisis'}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <Card>
        <Card.Content className="grid gap-4 sm:grid-cols-4">
          <Info label="Estado">
            <StatusChip status={file.status} />
          </Info>
          <Info label="Método de lectura">
            {file.readingMethod ? readingMethodLabels[file.readingMethod] : '—'}
          </Info>
          <Info label="Tamaño">{formatSize(file.sizeBytes)}</Info>
          <Info label="Costo de análisis">
            {formatCost(file.totalCostMicroUsd)}
          </Info>
          <Info label="Subido">{formatDateTime(file.uploadedAt)}</Info>
        </Card.Content>
      </Card>

      {file.failureReason && (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-sm ${
            file.status === 'failed'
              ? 'bg-danger/10 text-danger'
              : 'bg-warning/10 text-warning'
          }`}
        >
          <p className="font-medium">
            {file.status === 'failed'
              ? 'El análisis falló'
              : 'Revisa estos datos'}
          </p>
          <p>{file.failureReason}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <Card.Header>
            <Card.Title>Registros extraídos ({file.records.length})</Card.Title>
          </Card.Header>
          <Card.Content className="flex flex-col gap-3">
            {file.records.length === 0 ? (
              <p className="py-4 text-sm text-muted">
                {isInProgress(file.status)
                  ? 'Analizando el archivo…'
                  : 'No se extrajeron registros de este archivo.'}
              </p>
            ) : (
              file.records.map((record) => (
                <RecordEditor
                  key={record.id}
                  record={record}
                  onChange={() => void load()}
                  onDeleted={() => void load()}
                />
              ))
            )}
          </Card.Content>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>Original</Card.Title>
          </Card.Header>
          <Card.Content>
            {file.mimeType.startsWith('image/') &&
            !file.mimeType.includes('hei') ? (
              <img
                src={downloadUrl(file.id, true)}
                alt={file.originalName}
                className="max-h-[32rem] w-full rounded-lg object-contain"
              />
            ) : file.mimeType === 'application/pdf' ? (
              <iframe
                src={downloadUrl(file.id, true)}
                title={file.originalName}
                className="h-[32rem] w-full rounded-lg border border-separator"
              />
            ) : (
              <p className="text-sm text-muted">
                Este tipo de archivo no tiene vista previa. Puedes descargarlo
                arriba.
              </p>
            )}
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}

function Info({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}
