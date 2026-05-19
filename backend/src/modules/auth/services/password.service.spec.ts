import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('produces a bcrypt hash (60-char string starting with $2)', async () => {
    const h = await svc.hash('correct horse battery staple');
    expect(h).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
  });

  it('compare returns true for the original plaintext', async () => {
    const plain = 'correct horse battery staple';
    const h = await svc.hash(plain);
    await expect(svc.compare(plain, h)).resolves.toBe(true);
  });

  it('compare returns false for the wrong plaintext', async () => {
    const h = await svc.hash('correct horse battery staple');
    await expect(svc.compare('wrong password', h)).resolves.toBe(false);
  });

  it('two hashes of the same plaintext are different (random salt)', async () => {
    const plain = 'same input';
    const a = await svc.hash(plain);
    const b = await svc.hash(plain);
    expect(a).not.toBe(b);
    // Both verify against the original.
    await expect(svc.compare(plain, a)).resolves.toBe(true);
    await expect(svc.compare(plain, b)).resolves.toBe(true);
  });
});
