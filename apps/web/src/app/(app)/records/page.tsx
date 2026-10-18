import { RecordsExplorer } from '../../components/records-explorer';

export default function RecordsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Análisis</h1>
        <p className="text-sm text-muted">
          Gastos, ingresos y productos de tus documentos, por semana o por mes.
        </p>
      </header>
      <RecordsExplorer />
    </div>
  );
}
