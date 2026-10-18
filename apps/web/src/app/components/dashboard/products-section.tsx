'use client';

import type { Period, ProductRow } from '@org/shared';
import Link from 'next/link';
import { getProducts } from '../../lib/files-api';
import { formatMoney, formatPeriod } from '../../lib/format';
import { DashboardSection, useSection } from './dashboard-section';

const TOP = 5;

function ProductList({ title, rows }: { title: string; rows: ProductRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          Sin productos en este periodo. Aparecen cuando tus documentos traen
          líneas de producto.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {rows.map((row) => (
            <li
              key={`${row.productName}-${row.currency}`}
              className="flex justify-between gap-3"
            >
              <span className="truncate">
                {row.productName}{' '}
                <span className="text-muted">× {row.quantity}</span>
              </span>
              <span className="shrink-0">
                {formatMoney(row.totalMinor, row.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProductsSection({
  period,
  refreshKey,
}: {
  period: Period;
  refreshKey: number;
}) {
  const state = useSection(
    async () => {
      const [purchases, sales] = await Promise.all([
        getProducts({ ...period, direction: 'purchase', limit: TOP }),
        getProducts({ ...period, direction: 'sale', limit: TOP }),
      ]);
      return { purchases, sales };
    },
    [period.from, period.to],
    { refreshKey },
  );

  return (
    <DashboardSection
      title="Productos principales"
      subtitle={`Top ${TOP} por monto · ${formatPeriod(period.from, period.to)}`}
      state={state}
    >
      {({ purchases, sales }) => (
        <div className="flex flex-col gap-4">
          <div className="grid gap-6 sm:grid-cols-2">
            <ProductList title="Más comprados" rows={purchases} />
            <ProductList title="Más vendidos" rows={sales} />
          </div>
          <Link
            href="/records"
            className="self-start text-sm text-accent hover:underline"
          >
            Ver todos en Análisis
          </Link>
        </div>
      )}
    </DashboardSection>
  );
}
