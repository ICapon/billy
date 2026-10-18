'use client';

import { Card } from '@heroui/react';
import { BarChart, DonutChart, LineChart } from '../../components/charts';
import { useProjects } from '../../components/projects-provider';

const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul'];

// Datos de demostración deterministas por proyecto (hasta tener datos reales).
function seeded(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    return h / 4294967296;
  };
}

function demoData(seed: string) {
  const rnd = seeded(seed);
  const series = (base: number, step: number) =>
    months.map((_, i) => Math.round(base + i * step + rnd() * base * 0.4));
  const pdf = 30 + Math.round(rnd() * 30);
  const csv = 10 + Math.round(rnd() * 30);
  return {
    analyses: series(100, 30),
    uploads: series(30, 12),
    types: [pdf, csv, Math.max(5, 100 - pdf - csv)],
    stats: [
      {
        label: 'Archivos analizados',
        value: (800 + Math.round(rnd() * 1200)).toLocaleString('en-US'),
        delta: '+12%',
      },
      {
        label: 'Análisis completados',
        value: (700 + Math.round(rnd() * 1100)).toLocaleString('en-US'),
        delta: '+8%',
      },
      {
        label: 'Tiempo medio',
        value: `${(2 + rnd() * 3).toFixed(1)} s`,
        delta: '-5%',
      },
      { label: 'Errores', value: `${(rnd() * 2).toFixed(1)}%`, delta: '-0.3%' },
    ],
  };
}

function Panel({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <Card.Header>
        <Card.Title>{title}</Card.Title>
      </Card.Header>
      <Card.Content>{children}</Card.Content>
    </Card>
  );
}

export default function DashboardPage() {
  const { ready, current } = useProjects();
  if (!ready) return null;
  if (!current) {
    return (
      <p className="text-muted">Crea un proyecto para ver su dashboard.</p>
    );
  }
  const { analyses, uploads, types, stats } = demoData(current.id);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">{current.name}</h1>
        <p className="text-sm text-muted">
          Dashboard del proyecto (datos de demostración).
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <Card.Content className="flex flex-col gap-1">
              <span className="text-sm text-muted">{s.label}</span>
              <span className="text-2xl font-semibold">{s.value}</span>
              <span className="text-xs text-success">
                {s.delta} vs. mes anterior
              </span>
            </Card.Content>
          </Card>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Análisis por mes" className="lg:col-span-2">
          <LineChart data={analyses} labels={months} />
        </Panel>
        <Panel title="Tipos de archivo">
          <DonutChart
            data={[
              { label: 'PDF', value: types[0], color: 'var(--accent)' },
              { label: 'CSV', value: types[1], color: 'var(--success)' },
              { label: 'Excel', value: types[2], color: 'var(--warning)' },
            ]}
          />
        </Panel>
      </section>

      <Panel title="Archivos subidos por mes">
        <BarChart data={uploads} labels={months} />
      </Panel>
    </div>
  );
}
