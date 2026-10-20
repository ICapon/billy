import type { FileDocument } from '@org/shared';
import {
  bankStatementDetailsSchema,
  commercialDetailsSchema,
  payrollDetailsSchema,
  salesReportDetailsSchema,
} from '@org/shared';
import {
  consistencyLabels,
  documentTypeLabels,
  formatMoney,
  formatPeriod,
} from '../lib/format';

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  );
}

const paymentLabels = {
  paid: 'Pagado',
  pending: 'Pendiente',
  unknown: 'No indicado',
} as const;

/** The type-specific data of one document of a file (figures in minor units). */
export function DocumentData({ document }: { document: FileDocument }) {
  const money = (minor: number) => formatMoney(minor, document.currency);
  const period =
    document.periodStart && document.periodEnd
      ? formatPeriod(document.periodStart, document.periodEnd)
      : (document.periodEnd ?? document.issueDate ?? '—');
  let figures: React.ReactNode = null;

  if (document.type === 'bank_statement') {
    const d = bankStatementDetailsSchema.safeParse(document.details);
    if (d.success) {
      figures = (
        <>
          <Figure label="Cuenta" value={d.data.accountIdentifier ?? '—'} />
          <Figure
            label="Saldo inicial"
            value={money(d.data.openingBalanceMinor)}
          />
          <Figure
            label="Saldo final"
            value={money(d.data.closingBalanceMinor)}
          />
          <Figure label="Depósitos" value={money(d.data.totalDepositsMinor)} />
          <Figure label="Retiros" value={money(d.data.totalWithdrawalsMinor)} />
          <Figure label="Comisiones" value={money(d.data.totalFeesMinor)} />
        </>
      );
    }
  } else if (document.type === 'payroll') {
    const d = payrollDetailsSchema.safeParse(document.details);
    if (d.success) {
      figures = (
        <>
          <Figure label="Empleados" value={d.data.employeeCount} />
          <Figure label="Pago bruto" value={money(d.data.grossTotalMinor)} />
          <Figure
            label="Deducciones"
            value={money(d.data.deductionsTotalMinor)}
          />
          <Figure label="Pago neto" value={money(d.data.netTotalMinor)} />
          <Figure
            label="Costo total"
            value={money(
              d.data.employerTotalCostMinor ?? d.data.grossTotalMinor,
            )}
          />
        </>
      );
    }
  } else if (document.type === 'invoice' || document.type === 'receipt') {
    const d = commercialDetailsSchema.safeParse(document.details);
    if (d.success) {
      figures = (
        <>
          <Figure label="Contraparte" value={d.data.counterparty ?? '—'} />
          <Figure
            label="Subtotal"
            value={
              d.data.subtotalMinor === null ? '—' : money(d.data.subtotalMinor)
            }
          />
          <Figure
            label="Impuestos"
            value={d.data.taxMinor === null ? '—' : money(d.data.taxMinor)}
          />
          <Figure label="Total" value={money(d.data.totalMinor)} />
          <Figure label="Pago" value={paymentLabels[d.data.paymentStatus]} />
        </>
      );
    }
  } else if (document.type === 'sales_report') {
    const d = salesReportDetailsSchema.safeParse(document.details);
    if (d.success) {
      figures = (
        <>
          <Figure
            label="Ventas totales"
            value={money(d.data.totalSalesMinor)}
          />
          <Figure label="Unidades" value={d.data.unitsSold ?? '—'} />
          <Figure
            label="Transacciones"
            value={d.data.transactionCount ?? '—'}
          />
        </>
      );
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-separator p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {documentTypeLabels[document.type]} · {period}
        </span>
        <span
          className={`text-xs ${document.consistency === 'inconsistent' ? 'text-warning' : 'text-muted'}`}
        >
          {consistencyLabels[document.consistency]} · confianza en el tipo{' '}
          {Math.round(document.typeConfidence * 100)} %
        </span>
      </div>
      {figures && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{figures}</div>
      )}
      {document.consistencyNotes && (
        <p className="text-xs text-warning">{document.consistencyNotes}</p>
      )}
      {document.payrollLines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-medium">Empleado</th>
                <th className="py-1 text-right font-medium">Bruto</th>
                <th className="py-1 text-right font-medium">Deducciones</th>
                <th className="py-1 text-right font-medium">Neto</th>
              </tr>
            </thead>
            <tbody>
              {document.payrollLines.map((line, i) => (
                <tr
                  key={`${line.employeeName}-${i}`}
                  className="border-t border-separator"
                >
                  <td className="py-1.5">{line.employeeName}</td>
                  <td className="py-1.5 text-right">
                    {money(line.grossMinor)}
                  </td>
                  <td className="py-1.5 text-right">
                    {money(line.deductionsMinor)}
                  </td>
                  <td className="py-1.5 text-right">{money(line.netMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
