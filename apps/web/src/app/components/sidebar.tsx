'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ProjectSelector } from './project-selector';

const icons = {
  dashboard: <path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />,
  records: <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />,
  files: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  ),
  upload: (
    <path d="M12 16V4m0 0L7 9m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  ),
};

const items = [
  { href: '/dashboard', label: 'Dashboard', icon: icons.dashboard },
  { href: '/upload', label: 'Subir archivos', icon: icons.upload },
  { href: '/files', label: 'Archivos', icon: icons.files },
  { href: '/records', label: 'Análisis', icon: icons.records },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-16 shrink-0 flex-col border-r border-separator bg-surface p-3 md:w-60 md:p-4">
      <ProjectSelector />
      <div className="mb-6 flex items-center gap-2 px-2 py-1">
        <div className="flex size-8 items-center justify-center rounded-lg bg-accent font-bold text-accent-foreground">
          B
        </div>
        <span className="hidden text-lg font-semibold md:block">Billy</span>
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted hover:bg-default hover:text-foreground'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                {item.icon}
              </svg>
              <span className="hidden md:block">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
