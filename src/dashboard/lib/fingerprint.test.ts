import { describe, expect, it } from 'vitest';
import { fingerprint } from './fingerprint';

describe('fingerprint', () => {
  it('gives the same short key for the same text, and another for other text', () => {
    const secret = 'github_pat_11ABCDEFG0abcdefghijklmnopqrstuvwxyz';

    expect(fingerprint(secret)).toBe(fingerprint(secret));
    expect(fingerprint(secret)).not.toBe(fingerprint(`${secret}x`));
    expect(fingerprint('a')).not.toBe(fingerprint('b'));
  });

  it('does not spell the text out, and stays short', () => {
    const secret = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
    const key = fingerprint(secret);

    expect(key).toMatch(/^[0-9a-z]{1,7}$/);
    expect(key).not.toContain('ghp');
  });

  it('copes with nothing, and with a long text', () => {
    expect(fingerprint('')).toMatch(/^[0-9a-z]+$/);
    expect(fingerprint('x'.repeat(10_000))).toMatch(/^[0-9a-z]+$/);
  });
});
