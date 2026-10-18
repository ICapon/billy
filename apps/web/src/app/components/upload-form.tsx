'use client';

import { Button, Card } from '@heroui/react';
import {
  DEFAULT_MAX_FILE_SIZE_MB,
  DEFAULT_MAX_FILES_PER_BATCH,
  type DuplicateMode,
} from '@org/shared';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { uploadFile } from '../lib/files-api';
import { formatSize } from '../lib/format';

type ItemStatus =
  'pending' | 'uploading' | 'done' | 'duplicate' | 'rejected' | 'error';

interface UploadItem {
  id: string;
  file: File;
  status: ItemStatus;
  progress: number;
  message?: string;
}

const ACCEPT = '.pdf,.csv,.xlsx,.txt,.jpg,.jpeg,.png,.webp,.heic,.heif';
const MAX_BYTES = DEFAULT_MAX_FILE_SIZE_MB * 1024 * 1024;
const CONCURRENCY = 3;

let counter = 0;
const nextId = () => `upload-${(counter += 1)}`;

const statusText: Record<ItemStatus, string> = {
  pending: 'En espera',
  uploading: 'Subiendo…',
  done: 'Subido',
  duplicate: 'Ya existe',
  rejected: 'Rechazado',
  error: 'Error',
};

export function UploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const patch = (id: string, changes: Partial<UploadItem>) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...changes } : i)),
    );

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setItems((prev) => {
      const next = [...prev];
      for (const file of Array.from(list)) {
        const pending = next.filter((i) => i.status === 'pending').length;
        const item: UploadItem = {
          id: nextId(),
          file,
          status: 'pending',
          progress: 0,
        };
        if (file.size === 0) {
          item.status = 'rejected';
          item.message = 'El archivo está vacío';
        } else if (file.size > MAX_BYTES) {
          item.status = 'rejected';
          item.message = `Supera el máximo de ${DEFAULT_MAX_FILE_SIZE_MB} MB`;
        } else if (pending >= DEFAULT_MAX_FILES_PER_BATCH) {
          item.status = 'rejected';
          item.message = `Máximo ${DEFAULT_MAX_FILES_PER_BATCH} archivos a la vez`;
        }
        next.push(item);
      }
      return next;
    });
  };

  const send = async (item: UploadItem, mode: DuplicateMode = 'skip') => {
    patch(item.id, { status: 'uploading', progress: 0, message: undefined });
    try {
      const result = await uploadFile(item.file, {
        onDuplicate: mode,
        onProgress: (progress) => patch(item.id, { progress }),
      });
      if (result.outcome === 'accepted') {
        patch(item.id, { status: 'done', progress: 1 });
      } else if (result.outcome === 'duplicate') {
        patch(item.id, {
          status: 'duplicate',
          message:
            'Ya subiste este archivo. ¿Quieres omitirlo o conservar ambos?',
        });
      } else {
        patch(item.id, {
          status: 'rejected',
          message: result.reason ?? 'Archivo rechazado',
        });
      }
    } catch (error) {
      patch(item.id, {
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'No se pudo subir el archivo',
      });
    }
  };

  const uploadAll = async () => {
    setBusy(true);
    const queue = items.filter((i) => i.status === 'pending');
    const workers = Array.from({ length: CONCURRENCY }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        await send(item);
      }
    });
    await Promise.all(workers);
    setBusy(false);
  };

  const remove = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const uploadedCount = items.filter((i) => i.status === 'done').length;

  return (
    <div className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
          dragging
            ? 'border-accent bg-accent/10'
            : 'border-separator hover:border-accent hover:bg-default'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-10 text-accent"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 16V4m0 0L7 9m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
        <p className="font-medium">Arrastra tus archivos aquí</p>
        <p className="text-sm text-muted">
          o haz clic para seleccionarlos · PDF, imágenes, CSV, XLSX · hasta{' '}
          {DEFAULT_MAX_FILE_SIZE_MB} MB
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept={ACCEPT}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {items.length > 0 && (
        <Card>
          <Card.Header>
            <Card.Title>Archivos ({items.length})</Card.Title>
          </Card.Header>
          <Card.Content className="flex flex-col gap-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-xl bg-default px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate">{item.file.name}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-muted">
                      {formatSize(item.file.size)}
                    </span>
                    <span
                      className={
                        item.status === 'done'
                          ? 'text-success'
                          : item.status === 'rejected' ||
                              item.status === 'error'
                            ? 'text-danger'
                            : item.status === 'duplicate'
                              ? 'text-warning'
                              : 'text-muted'
                      }
                    >
                      {statusText[item.status]}
                    </span>
                    {item.status !== 'uploading' && (
                      <button
                        type="button"
                        className="text-muted hover:text-danger"
                        onClick={() => remove(item.id)}
                        aria-label={`Quitar ${item.file.name}`}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </div>

                {item.status === 'uploading' && (
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-separator"
                    role="progressbar"
                    aria-valuenow={Math.round(item.progress * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full bg-accent transition-all"
                      style={{ width: `${Math.round(item.progress * 100)}%` }}
                    />
                  </div>
                )}

                {item.message && (
                  <p className="text-xs text-muted">{item.message}</p>
                )}

                {item.status === 'duplicate' && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() => remove(item.id)}
                    >
                      Omitir
                    </Button>
                    <Button size="sm" onPress={() => void send(item, 'keep')}>
                      Conservar ambos
                    </Button>
                  </div>
                )}

                {item.status === 'error' && (
                  <div className="flex gap-2">
                    <Button size="sm" onPress={() => void send(item)}>
                      Reintentar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </Card.Content>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2">
        {uploadedCount > 0 ? (
          <Link href="/files" className="text-sm text-accent hover:underline">
            Ver archivos subidos ({uploadedCount})
          </Link>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            isDisabled={!items.length || busy}
            onPress={() => setItems([])}
          >
            Limpiar
          </Button>
          <Button
            isDisabled={!pendingCount || busy}
            onPress={() => void uploadAll()}
          >
            {busy
              ? 'Subiendo…'
              : `Subir${pendingCount ? ` (${pendingCount})` : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
