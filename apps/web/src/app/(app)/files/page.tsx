import { Suspense } from 'react';
import { CostBanner } from '../../components/cost-banner';
import { DuplicatesPanel } from '../../components/duplicates-panel';
import { FilesTable } from '../../components/files-table';

export default function FilesPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Archivos</h1>
        <p className="text-sm text-muted">
          Documentos subidos y el estado de su análisis.
        </p>
      </header>
      <CostBanner />
      <DuplicatesPanel />
      <Suspense fallback={null}>
        <FilesTable />
      </Suspense>
    </div>
  );
}
