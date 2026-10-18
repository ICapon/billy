import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { filesRepository, type DbHandle } from '@org/db';
import { loadConfig, type UploadResult } from '@org/shared';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';
import { APP_CONFIG } from '../config/config.module';
import { DB } from '../database/db.token';
import { QueueService } from '../queue/queue.service';
import { infraAvailable } from '../../testing/infra';

const enqueueExtraction = jest.fn().mockResolvedValue(undefined);

describe('FilesController (integration)', () => {
  let available = false;
  let app: INestApplication;
  let base = '';
  const ownerId = `test-${randomUUID()}`;

  const startApp = async (overrides: Record<string, string> = {}) => {
    const config = loadConfig({
      ...process.env,
      BUSINESS_OWNER_ID: ownerId,
      ...overrides,
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(config)
      .overrideProvider(QueueService)
      .useValue({ enqueueExtraction })
      .compile();
    const instance = moduleRef.createNestApplication();
    configureApp(instance);
    await instance.listen(0);
    return instance;
  };

  const upload = async (
    parts: { name: string; content: string | Buffer; type?: string }[],
    fields: Record<string, string> = {},
  ): Promise<UploadResult[]> => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    for (const part of parts) {
      form.append(
        'files',
        new Blob([part.content], {
          type: part.type ?? 'application/octet-stream',
        }),
        part.name,
      );
    }
    const response = await fetch(`${base}/api/files`, {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(207);
    return ((await response.json()) as { results: UploadResult[] }).results;
  };

  beforeAll(async () => {
    available = await infraAvailable();
    if (!available) {
      console.warn(
        'SKIPPED FilesController: Postgres/S3 are not reachable. Run `pnpm infra:up` and `pnpm nx run db:migrate`.',
      );
      return;
    }
    app = await startApp();
    base = await app.getUrl();
  });

  afterAll(async () => {
    if (!available) return;
    // Remove everything the suite created (database rows and stored objects).
    const handle = app.get<DbHandle>(DB);
    const files = filesRepository(handle.db, ownerId);
    const page = await files.list({ limit: 100 });
    for (const file of page.items) {
      await fetch(`${base}/api/files/${file.id}`, { method: 'DELETE' });
    }
    await app.close();
  });

  beforeEach(() => enqueueExtraction.mockClear());

  const run = (name: string, fn: () => Promise<void>) =>
    it(name, async () => {
      if (available) await fn();
    });

  run('stores valid files, rejects invalid ones and lists them', async () => {
    const results = await upload([
      {
        name: 'ventas.csv',
        content: 'fecha,total\n2026-10-01,100\n',
        type: 'text/csv',
      },
      { name: 'ticket.pdf', content: '%PDF-1.4 fake', type: 'application/pdf' },
      { name: 'virus.exe', content: 'MZ', type: 'application/x-msdownload' },
      { name: 'vacio.csv', content: '', type: 'text/csv' },
    ]);

    expect(results.map((r) => r.outcome)).toEqual([
      'accepted',
      'accepted',
      'rejected',
      'rejected',
    ]);
    expect(results[2].reason).toContain('virus.exe');
    expect(results[3].reason).toContain('empty');
    expect(results[0].file?.status).toBe('received');
    expect(enqueueExtraction).toHaveBeenCalledTimes(2);

    const list = (await (await fetch(`${base}/api/files`)).json()) as {
      items: { originalName: string }[];
    };
    const names = list.items.map((f) => f.originalName);
    expect(names).toEqual(expect.arrayContaining(['ventas.csv', 'ticket.pdf']));
    expect(names).not.toContain('virus.exe');
  });

  run('downloads the original bytes and returns file detail', async () => {
    const content = 'fecha,total\n2026-10-02,55\n';
    const [result] = await upload([
      { name: 'descarga.csv', content, type: 'text/csv' },
    ]);
    const id = result.file?.id as string;

    const download = await fetch(`${base}/api/files/${id}/download`);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toContain(
      'descarga.csv',
    );
    expect(await download.text()).toBe(content);

    const inline = await fetch(`${base}/api/files/${id}/download?inline=1`);
    expect(inline.headers.get('content-disposition')).toMatch(/^inline;/);
    await inline.arrayBuffer();

    const detail = (await (await fetch(`${base}/api/files/${id}`)).json()) as {
      id: string;
      records: unknown[];
    };
    expect(detail.id).toBe(id);
    expect(detail.records).toEqual([]);
  });

  run('reports duplicates and keeps a copy on request', async () => {
    const part = { name: 'dup.csv', content: 'a,b\n1,2\n', type: 'text/csv' };
    const [first] = await upload([part]);
    expect(first.outcome).toBe('accepted');

    const [second] = await upload([part]);
    expect(second.outcome).toBe('duplicate');
    expect(second.existingFileId).toBe(first.file?.id);
    expect(enqueueExtraction).toHaveBeenCalledTimes(1);

    const [kept] = await upload([part], { onDuplicate: 'keep' });
    expect(kept.outcome).toBe('accepted');
    expect(kept.file?.duplicateOf).toBe(first.file?.id);
  });

  run('deletes the file, its object and its list entry', async () => {
    const [result] = await upload([
      { name: 'borrar.csv', content: 'x,y\n3,4\n', type: 'text/csv' },
    ]);
    const id = result.file?.id as string;

    expect(
      (await fetch(`${base}/api/files/${id}`, { method: 'DELETE' })).status,
    ).toBe(204);
    expect((await fetch(`${base}/api/files/${id}`)).status).toBe(404);
    expect((await fetch(`${base}/api/files/${id}/download`)).status).toBe(404);
    expect(
      (await fetch(`${base}/api/files/${id}`, { method: 'DELETE' })).status,
    ).toBe(404);
  });

  run('retries failed files only', async () => {
    const [result] = await upload([
      { name: 'reintento.csv', content: 'r,1\n', type: 'text/csv' },
    ]);
    const id = result.file?.id as string;
    const repo = filesRepository(app.get<DbHandle>(DB).db, ownerId);
    enqueueExtraction.mockClear();

    // a received file is not retryable
    expect(
      (await fetch(`${base}/api/files/${id}/retry`, { method: 'POST' })).status,
    ).toBe(409);

    await repo.update(id, { status: 'failed', failureReason: 'boom' });
    expect(
      (await fetch(`${base}/api/files/${id}/retry`, { method: 'POST' })).status,
    ).toBe(202);
    const after = await repo.findById(id);
    expect(after?.status).toBe('received');
    expect(after?.failureReason).toBeNull();
    expect(enqueueExtraction).toHaveBeenCalledWith(id);

    await repo.update(id, { status: 'needs_review' });
    expect(
      (await fetch(`${base}/api/files/${id}/retry`, { method: 'POST' })).status,
    ).toBe(202);

    expect(
      (
        await fetch(`${base}/api/files/${randomUUID()}/retry`, {
          method: 'POST',
        })
      ).status,
    ).toBe(404);
  });

  run('validates ids and filters', async () => {
    expect((await fetch(`${base}/api/files/not-a-uuid`)).status).toBe(400);
    expect((await fetch(`${base}/api/files?status=bogus`)).status).toBe(400);
    expect((await fetch(`${base}/api/files?status=failed`)).status).toBe(200);
  });

  run(
    'rejects oversize files and files beyond the batch limit per file',
    async () => {
      const limited = await startApp({
        MAX_FILE_SIZE_MB: '0.001',
        MAX_FILES_PER_BATCH: '2',
      });
      const url = await limited.getUrl();
      try {
        const form = new FormData();
        form.append(
          'files',
          new Blob(['small,1\n'], { type: 'text/csv' }),
          'ok1.csv',
        );
        form.append(
          'files',
          new Blob(['x'.repeat(5000)], { type: 'text/csv' }),
          'big.csv',
        );
        form.append(
          'files',
          new Blob(['two,2\n'], { type: 'text/csv' }),
          'ok2.csv',
        );
        form.append(
          'files',
          new Blob(['three,3\n'], { type: 'text/csv' }),
          'ok3.csv',
        );
        const response = await fetch(`${url}/api/files`, {
          method: 'POST',
          body: form,
        });
        const { results } = (await response.json()) as {
          results: UploadResult[];
        };

        const byName = Object.fromEntries(results.map((r) => [r.name, r]));
        expect(byName['ok1.csv'].outcome).toBe('accepted');
        expect(byName['big.csv'].outcome).toBe('rejected');
        expect(byName['big.csv'].reason).toContain('larger than');
        expect(byName['ok2.csv'].outcome).toBe('accepted');
        expect(byName['ok3.csv'].outcome).toBe('rejected');
        expect(byName['ok3.csv'].reason).toContain('2 files');
      } finally {
        await limited.close();
      }
    },
  );
});
