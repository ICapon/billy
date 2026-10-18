import { buildStorageKey } from './storage.service';

describe('buildStorageKey', () => {
  const now = new Date('2026-10-18T10:00:00Z');

  it('builds owner/yyyy/mm/<id>-<name>', () => {
    expect(buildStorageKey('default', 'abc', 'ticket.pdf', now)).toBe(
      'default/2026/10/abc-ticket.pdf',
    );
  });

  it('sanitizes path tricks and unsafe characters', () => {
    const key = buildStorageKey('own er', 'id1', '../../etc/pass wd?.pdf', now);
    expect(key).toBe('own_er/2026/10/id1-etc_pass_wd_.pdf');
    expect(key).not.toContain('..');
  });

  it('falls back to a default name and truncates long names', () => {
    expect(buildStorageKey('o', 'id', '...', now)).toBe('o/2026/10/id-file');
    const long = buildStorageKey('o', 'id', `${'a'.repeat(300)}.pdf`, now);
    expect(long.length).toBeLessThan(150);
  });
});
