'use client';

import { Button } from '@heroui/react';
import {
  periodFromPreset,
  validatePeriod,
  type Period,
  type PeriodPreset,
} from '@org/shared';
import { useState } from 'react';
import { formatPeriod } from '../../lib/format';

const presetLabels: Record<PeriodPreset, string> = {
  '7d': '7 días',
  '30d': '30 días',
  '90d': '90 días',
  month: 'Este mes',
  custom: 'Personalizado',
};
const presets: PeriodPreset[] = ['7d', '30d', '90d', 'month', 'custom'];

const inputClass =
  'rounded-lg border border-separator bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent';

/**
 * Presets plus a custom range. An invalid range shows a message and leaves the applied
 * period (and therefore the data on screen) untouched.
 */
export function PeriodPicker({
  preset,
  period,
  onChange,
}: {
  preset: PeriodPreset;
  period: Period;
  onChange: (preset: PeriodPreset, period: Period) => void;
}) {
  const [custom, setCustom] = useState(preset === 'custom');
  const [draft, setDraft] = useState<Period>(period);
  const [error, setError] = useState<string | null>(null);

  const choose = (next: PeriodPreset) => {
    setError(null);
    if (next === 'custom') {
      setDraft(period);
      setCustom(true);
      return;
    }
    setCustom(false);
    onChange(next, periodFromPreset(next));
  };

  const apply = () => {
    const message = validatePeriod(draft);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    onChange('custom', draft);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex flex-wrap overflow-hidden rounded-lg border border-separator"
          role="group"
          aria-label="Periodo"
        >
          {presets.map((value) => {
            const active = custom ? value === 'custom' : value === preset;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => choose(value)}
                className={`px-3 py-1.5 text-sm ${
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-default'
                }`}
              >
                {presetLabels[value]}
              </button>
            );
          })}
        </div>
        <span className="text-sm text-muted">
          {formatPeriod(period.from, period.to)}
        </span>
      </div>

      {custom && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Desde
            <input
              type="date"
              className={inputClass}
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Hasta
            <input
              type="date"
              className={inputClass}
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </label>
          <Button size="sm" onPress={apply}>
            Aplicar
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
