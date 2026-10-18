import { createProjectSchema } from './project';

describe('createProjectSchema', () => {
  it('trims and accepts a valid name', () => {
    expect(createProjectSchema.parse({ name: '  Mi negocio ' }).name).toBe(
      'Mi negocio',
    );
  });

  it('rejects empty and overlong names', () => {
    expect(createProjectSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(
      createProjectSchema.safeParse({ name: 'x'.repeat(61) }).success,
    ).toBe(false);
  });
});
