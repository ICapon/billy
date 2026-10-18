import { FILE_EXTRACTION_QUEUE, jobPayloadSchema } from './jobs';

describe('jobPayloadSchema', () => {
  it('accepts a file id', () => {
    expect(
      jobPayloadSchema.safeParse({
        fileId: '3f0e8b4e-7c1a-4d6e-9a53-1f6f5d0c2b11',
      }).success,
    ).toBe(true);
  });

  it('rejects missing or malformed ids', () => {
    expect(jobPayloadSchema.safeParse({}).success).toBe(false);
    expect(jobPayloadSchema.safeParse({ fileId: 'abc' }).success).toBe(false);
  });

  it('exposes the queue name', () => {
    expect(FILE_EXTRACTION_QUEUE).toBe('file-extraction');
  });
});
