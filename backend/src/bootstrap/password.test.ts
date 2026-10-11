import { describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from './password';

describe('password rule', () => {
  it('requires 12 characters', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
  });

  it('hashes at bcrypt cost 12', async () => {
    expect(bcrypt.getRounds(await hashPassword('long-enough-password'))).toBe(12);
  });
});

describe('verifyPassword', () => {
  it('accepts the password of the hash', async () => {
    const hash = await bcrypt.hash('right-password', 4);
    expect(await verifyPassword('right-password', hash)).toBe(true);
  });

  it('rejects another password', async () => {
    const hash = await bcrypt.hash('right-password', 4);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('runs a cost-12 comparison and answers false without a hash', async () => {
    const compare = vi.spyOn(bcrypt, 'compare');

    expect(await verifyPassword('any-password', undefined)).toBe(false);
    expect(await verifyPassword('any-password', undefined)).toBe(false);

    expect(compare).toHaveBeenCalledTimes(2);
    const dummyHash = compare.mock.calls[0][1];
    expect(bcrypt.getRounds(dummyHash)).toBe(12);
    // Computed once, then reused
    expect(compare.mock.calls[1][1]).toBe(dummyHash);
    compare.mockRestore();
  });
});
