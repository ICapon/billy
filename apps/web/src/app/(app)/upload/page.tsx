import { UploadForm } from '../../components/upload-form';

export default function UploadPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Subir archivos</h1>
        <p className="text-sm text-muted">
          Sube documentos para que Billy los analice.
        </p>
      </header>
      <UploadForm />
    </div>
  );
}
