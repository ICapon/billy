'use client';

import { Button, Card } from '@heroui/react';
import {
  documentTypeSchema,
  documentTypes,
  fileStatusSchema,
  type BusinessFile,
  type DocumentType,
} from '@org/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { deleteFile, downloadUrl, listFiles } from '../lib/files-api';
import {
  formatCost,
  formatDateTime,
  formatSize,
  documentTypeLabels,
  isInProgress,
  statusLabels,
  UNCLASSIFIED_LABEL,
} from '../lib/format';
import { DocumentTypeChip } from './document-type-chip';
import { FILES_CHANGED_EVENT } from './reanalyze-dialog';
import { StatusChip } from './status-chip';

const POLL_MS = 4000;

export function FilesTable() {
  // ?status=needs_review (from the dashboard) filters the list; unknown values are ignored
  const parsedStatus = fileStatusSchema.safeParse(
    useSearchParams().get('status'),
  );
  const status = parsedStatus.success ? parsedStatus.data : undefined;
  // ?documentType=payroll|...|unclassified narrows the list by document type
  const typeParam = useSearchParams().get('documentType');
  const initialType: DocumentType | 'unclassified' | '' =
    typeParam === 'unclassified'
      ? 'unclassified'
      : documentTypeSchema.safeParse(typeParam).success
        ? (typeParam as DocumentType)
        : '';
  const [typeFilter, setTypeFilter] = useState<
    DocumentType | 'unclassified' | ''
  >(initialType);
  const [files, setFiles] = useState<BusinessFile[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const page = await listFiles({
        limit: 50,
        status,
        documentType: typeFilter || undefined,
      });
      setFiles(page.items);
      setNextCursor(page.nextCursor);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudieron cargar los archivos',
      );
    }
  }, [status, typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Other parts of the page (for example the re-analysis banner) ask for a reload.
  useEffect(() => {
    const reload = () => void load();
    window.addEventListener(FILES_CHANGED_EVENT, reload);
    return () => window.removeEventListener(FILES_CHANGED_EVENT, reload);
  }, [load]);

  // Poll while any file is still being processed.
  const polling = files?.some((f) => isInProgress(f.status)) ?? false;
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [polling, load]);

  const loadMore = async () => {
    if (!nextCursor) return;
    const page = await listFiles({
      limit: 50,
      cursor: nextCursor,
      status,
      documentType: typeFilter || undefined,
    });
    setFiles((prev) => [...(prev ?? []), ...page.items]);
    setNextCursor(page.nextCursor);
  };

  const remove = async (file: BusinessFile) => {
    const confirmed = window.confirm(
      `¿Eliminar "${file.originalName}"? Se borrarán también sus datos extraídos y no se puede deshacer.`,
    );
    if (!confirmed) return;
    try {
      await deleteFile(file.id);
      setFiles((prev) => prev?.filter((f) => f.id !== file.id) ?? null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo eliminar el archivo',
      );
    }
  };

  if (files === null && !error) {
    return <p className="text-sm text-muted">Cargando archivos…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {status && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-default px-2.5 py-0.5">
            Mostrando: {statusLabels[status]}
          </span>
          <Link href="/files" className="text-accent hover:underline">
            Quitar filtro
          </Link>
        </p>
      )}

      <label className="flex items-center gap-2 text-sm text-muted">
        Tipo de documento
        <select
          className="rounded-lg border border-separator bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value as DocumentType | 'unclassified' | '')
          }
        >
          <option value="">Todos</option>
          {documentTypes.map((type) => (
            <option key={type} value={type}>
              {documentTypeLabels[type]}
            </option>
          ))}
          <option value="unclassified">{UNCLASSIFIED_LABEL}</option>
        </select>
      </label>

      {files && files.length === 0 && (
        <Card>
          <Card.Content className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-medium">
              {status
                ? 'No hay archivos con este estado'
                : 'Aún no has subido archivos'}
            </p>
            <Link href="/upload">
              <Button>Subir archivos</Button>
            </Link>
          </Card.Content>
        </Card>
      )}

      {files && files.length > 0 && (
        <Card>
          <Card.Content className="overflow-x-auto p-0">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-separator text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Archivo</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Subido</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Costo</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr
                    key={file.id}
                    className="border-b border-separator last:border-0"
                  >
                    <td className="max-w-64 px-4 py-3">
                      <Link
                        href={`/files/${file.id}`}
                        className="block truncate font-medium hover:text-accent"
                      >
                        {file.originalName}
                      </Link>
                      <span className="text-xs text-muted">
                        {formatSize(file.sizeBytes)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <DocumentTypeChip
                        type={file.documentType}
                        manual={file.documentTypeManual}
                      />
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {formatDateTime(file.uploadedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={file.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-muted">
                      {formatCost(file.totalCostMicroUsd)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-3 text-sm">
                        <a
                          href={downloadUrl(file.id)}
                          className="text-muted hover:text-foreground"
                        >
                          Descargar
                        </a>
                        <button
                          type="button"
                          className="text-muted hover:text-danger"
                          onClick={() => void remove(file)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card.Content>
        </Card>
      )}

      {nextCursor && (
        <div className="flex justify-center">
          <Button variant="secondary" onPress={() => void loadMore()}>
            Cargar más
          </Button>
        </div>
      )}
    </div>
  );
}
