'use client';

import { Button, Card } from '@heroui/react';
import { useRef, useState } from 'react';

// TODO: conectar con el backend (POST /api/files) cuando esté listo.
// Por ahora solo diseño: la lista es local y no se envía nada.

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  };

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
          o haz clic para seleccionarlos · PDF, CSV, XLSX
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept=".pdf,.csv,.xlsx,.xls"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {files.length > 0 && (
        <Card>
          <Card.Header>
            <Card.Title>Archivos seleccionados ({files.length})</Card.Title>
          </Card.Header>
          <Card.Content className="flex flex-col gap-2">
            {files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-default px-3 py-2 text-sm"
              >
                <span className="truncate">{f.name}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-muted">{formatSize(f.size)}</span>
                  <button
                    type="button"
                    className="text-muted hover:text-danger"
                    onClick={() =>
                      setFiles((prev) => prev.filter((_, j) => j !== i))
                    }
                    aria-label={`Quitar ${f.name}`}
                  >
                    ✕
                  </button>
                </span>
              </div>
            ))}
          </Card.Content>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          isDisabled={!files.length}
          onPress={() => setFiles([])}
        >
          Limpiar
        </Button>
        <Button isDisabled={!files.length}>Analizar</Button>
      </div>
    </div>
  );
}
