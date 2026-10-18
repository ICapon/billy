'use client';

import { Button } from '@heroui/react';
import {
  DEFAULT_PERIOD_PRESET,
  periodFromPreset,
  type Period,
  type PeriodPreset,
} from '@org/shared';
import { useState } from 'react';
import { ActivitySection } from '../../components/dashboard/activity-section';
import { AttentionSection } from '../../components/dashboard/attention-section';
import { CostSection } from '../../components/dashboard/cost-section';
import { FinanceSection } from '../../components/dashboard/finance-section';
import { PeriodPicker } from '../../components/dashboard/period-picker';
import { ProductsSection } from '../../components/dashboard/products-section';

export default function DashboardPage() {
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
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted">
            Resumen de los documentos que has analizado. Las fechas son UTC.
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

      <AttentionSection refreshKey={refreshKey} />
      <ActivitySection period={period} refreshKey={refreshKey} />
      <FinanceSection period={period} refreshKey={refreshKey} />
      <div className="grid gap-6 lg:grid-cols-2">
        <ProductsSection period={period} refreshKey={refreshKey} />
        <CostSection refreshKey={refreshKey} />
      </div>
    </div>
  );
}
