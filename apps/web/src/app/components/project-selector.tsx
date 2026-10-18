'use client';

import { useEffect, useRef, useState } from 'react';
import { useProjects } from './projects-provider';

export function ProjectSelector() {
  const { ready, projects, current, select, create } = useProjects();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = ready ? (current?.name ?? 'Sin proyecto') : 'Cargando…';

  return (
    <div ref={rootRef} className="relative mb-4">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Proyecto: ${label}`}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl border border-separator bg-default px-2 py-2 text-left text-sm font-medium hover:bg-default/80"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-bold text-accent-foreground">
          {label.charAt(0).toUpperCase()}
        </span>
        <span className="hidden min-w-0 flex-1 truncate md:block">{label}</span>
        <svg
          viewBox="0 0 24 24"
          className="hidden size-4 shrink-0 text-muted md:block"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-60 rounded-xl border border-separator bg-surface p-2 shadow-lg">
          <ul
            role="listbox"
            className="flex max-h-60 flex-col gap-1 overflow-auto"
          >
            {projects.map((p) => (
              <li key={p.id} role="option" aria-selected={p.id === current?.id}>
                <button
                  type="button"
                  onClick={() => {
                    select(p.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                    p.id === current?.id
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-default'
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-2 flex flex-col gap-2 border-t border-separator pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              const err = create(name);
              setError(err);
              if (!err) {
                setName('');
                setOpen(false);
              }
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nuevo proyecto"
              maxLength={60}
              aria-label="Nombre del nuevo proyecto"
              className="rounded-lg border border-separator bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            <button
              type="submit"
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
            >
              Crear proyecto
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
