import { FileDetail } from '../../../components/file-detail';

export default async function FileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-5xl">
      <FileDetail id={id} />
    </div>
  );
}
