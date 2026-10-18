import { loadConfig } from './config';

const credentials = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  S3_ACCESS_KEY: 'access',
  S3_SECRET_KEY: 'secret',
};

describe('loadConfig', () => {
  it('requires credentials instead of defaulting them', () => {
    expect(() => loadConfig({})).toThrow();
    expect(() => loadConfig({ ...credentials, S3_SECRET_KEY: '' })).toThrow();
  });

  it('applies non-secret defaults', () => {
    const config = loadConfig(credentials);
    expect(config.ownerId).toBe('default');
    expect(config.weekStart).toBe('monday');
    expect(config.currency).toBe('USD');
    expect(config.maxFileSizeBytes).toBe(20 * 1024 * 1024);
    expect(config.maxFilesPerBatch).toBe(20);
    expect(config.costLimitMicroUsd).toBeNull();
    expect(config.embedding.dimensions).toBe(1024);
  });

  it('treats empty values as unset (compose passes empty strings)', () => {
    const config = loadConfig({
      ...credentials,
      PROCESSING_COST_LIMIT_USD: '',
      ANTHROPIC_API_KEY: '',
      MAX_FILE_SIZE_MB: '',
    });
    expect(config.costLimitMicroUsd).toBeNull();
    expect(config.anthropicApiKey).toBeUndefined();
    expect(config.maxFileSizeBytes).toBe(20 * 1024 * 1024);
  });

  it('converts the USD limit to micro-USD', () => {
    expect(
      loadConfig({ ...credentials, PROCESSING_COST_LIMIT_USD: '12.5' })
        .costLimitMicroUsd,
    ).toBe(12_500_000);
    expect(
      loadConfig({ ...credentials, PROCESSING_COST_LIMIT_USD: '0.0001' })
        .costLimitMicroUsd,
    ).toBe(100);
  });

  it('rejects invalid values', () => {
    expect(() =>
      loadConfig({ ...credentials, BUSINESS_WEEK_START: 'friday' }),
    ).toThrow();
    expect(() =>
      loadConfig({ ...credentials, BUSINESS_CURRENCY: 'dollars' }),
    ).toThrow();
    expect(() =>
      loadConfig({ ...credentials, OCR_MIN_CONFIDENCE: '2' }),
    ).toThrow();
  });
});
