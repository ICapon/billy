'use client';

import { Button } from '@heroui/react';
import {
  DEFAULT_PERIOD_PRESET,
  periodFromPreset,
  type Period,
  type PeriodPreset,
} from '@org/shared';
import { useState } from 'react';
import { PeriodPicker } from '../../components/dashboard/period-picker';
import { CommercialTab } from '../../components/results/commercial-tab';
import { SalesTab } from '../../components/results/sales-tab';
import { LossesTab } from '../../components/results/losses-tab';
import { BankStatementsTab } from '../../components/results/bank-statements-tab';
import { PayrollTab } from '../../components/results/payroll-tab';

type TabId = 'losses' | 'bank' | 'payroll' | 'commercial' | 'sales';

const tabs: { id: TabId; label: string }[] = [
  { id: 'losses', label: 'Resultados y pérdidas' },
  { id: 'bank', label: 'Estados de cuenta' },
  { id: 'payroll', label: 'Nóminas' },
  { id: 'commercial', label: 'Facturas y recibos' },
  { id: 'sales', label: 'Ventas' },
];

export default function ResultsPage() {
  const [tab, setTab] = useState<TabId>('losses');
  // The default period is the last 30 days on every visit (nothing is persisted).
  const [preset, setPreset] = useState<PeriodPreset>(DEFAULT_PERIOD_PRESET);
  const [period, setPeriod] = useState<Period>(() =>
    periodFromPreset(DEFAULT_PERIOD_PRESET),
  );
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Resultados</h1>
          <p className="text-sm text-muted">
            Las métricas de cada tipo de documento que has analizado. Las fechas
            son UTC.
          </p>
        </div>
        <Button variant="secondary" onPress={() => setRefreshKey((k) => k + 1)}>
          Actualizar
        </Button>
      </header>

      <PeriodPicker
        preset={preset}
        period={period}
        onChange={(nextPreset, nextPeriod) => {
          setPreset(nextPreset);
          setPeriod(nextPeriod);
        }}
      />

      <div role="tablist" aria-label="Vistas" className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`rounded-lg border border-separator px-3 py-1.5 text-sm ${
              tab === item.id
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-default'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'losses' && (
        <LossesTab period={period} refreshKey={refreshKey} />
      )}
      {tab === 'bank' && (
        <BankStatementsTab period={period} refreshKey={refreshKey} />
      )}
      {tab === 'payroll' && (
        <PayrollTab period={period} refreshKey={refreshKey} />
      )}
      {tab === 'commercial' && (
        <CommercialTab period={period} refreshKey={refreshKey} />
      )}
      {tab === 'sales' && <SalesTab period={period} refreshKey={refreshKey} />}
    </div>
  );
}
