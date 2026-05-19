import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidTokenError,
} from '../errors';

const TEST_SECRET = 'test-secret-only';

function makeJwt(): JwtService {
  return new JwtService({ secret: TEST_SECRET, signOptions: { expiresIn: '1h' } });
}

function makeSvc(overrides: {
  findByEmail?: jest.Mock;
  findById?: jest.Mock;
  create?: jest.Mock;
}) {
  const users = {
    findByEmail: overrides.findByEmail ?? jest.fn().mockResolvedValue(null),
    findById: overrides.findById ?? jest.fn().mockResolvedValue(null),
    create: overrides.create ?? jest.fn(),
  };
  const passwords = new PasswordService();
  const jwt = makeJwt();
  return { svc: new AuthService(users as never, passwords, jwt), users, jwt };
}

describe('AuthService.signup', () => {
  it('creates a user and returns a SafeUser + token', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'uid-1',
      email: 'alice@example.com',
      passwordHash: 'irrelevant',
      createdAt: new Date('2026-05-19T10:00:00Z'),
    });
    const { svc } = makeSvc({ create });
    const result = await svc.signup('Alice@Example.com', 'correct horse battery staple');
    expect(result.user).toEqual({
      id: 'uid-1',
      email: 'alice@example.com',
      createdAt: new Date('2026-05-19T10:00:00Z'),
    });
    expect(typeof result.token).toBe('string');
    expect(result.token.split('.')).toHaveLength(3); // JWT shape
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].email).toBe('alice@example.com');
    expect(create.mock.calls[0][0].passwordHash).not.toBe('correct horse battery staple');
    expect(create.mock.calls[0][0].passwordHash).toMatch(/^\$2/);
  });

  it('throws EmailAlreadyRegisteredError when the email is taken', async () => {
    const findByEmail = jest.fn().mockResolvedValue({ id: 'uid-1', email: 'taken@example.com' });
    const create = jest.fn();
    const { svc } = makeSvc({ findByEmail, create });
    await expect(svc.signup('taken@example.com', 'password123456')).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredError,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('translates P2002 from create() into EmailAlreadyRegisteredError (concurrent-signup race)', async () => {
    // Two requests race past findByEmail (both see null), both hash,
    // both call create — only one wins the DB unique constraint.
    // The loser must see 409, not a leaked 500.
    const findByEmail = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockRejectedValue({
      code: 'P2002',
      message: 'Unique constraint failed on users.email',
    });
    const { svc } = makeSvc({ findByEmail, create });
    await expect(svc.signup('race@example.com', 'password123456')).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredError,
    );
  });

  it('propagates non-P2002 errors from create() (does not swallow real failures)', async () => {
    const findByEmail = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockRejectedValue(new Error('connection reset by peer'));
    const { svc } = makeSvc({ findByEmail, create });
    await expect(svc.signup('alice@example.com', 'password123456')).rejects.toThrow(
      /connection reset/,
    );
  });

  it('normalizes email to lowercase + trimmed before checking uniqueness', async () => {
    const findByEmail = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({
      id: 'uid-1',
      email: 'alice@example.com',
      passwordHash: 'h',
      createdAt: new Date(),
    });
    const { svc } = makeSvc({ findByEmail, create });
    await svc.signup('  ALICE@example.COM  ', 'password123456');
    expect(findByEmail).toHaveBeenCalledWith('alice@example.com');
    expect(create.mock.calls[0][0].email).toBe('alice@example.com');
  });
});

describe('AuthService.login', () => {
  it('returns SafeUser + token on correct credentials', async () => {
    const passwords = new PasswordService();
    const passwordHash = await passwords.hash('correct horse battery staple');
    const findByEmail = jest.fn().mockResolvedValue({
      id: 'uid-1',
      email: 'alice@example.com',
      passwordHash,
      createdAt: new Date('2026-05-19T10:00:00Z'),
    });
    const { svc } = makeSvc({ findByEmail });
    const result = await svc.login('alice@example.com', 'correct horse battery staple');
    expect(result.user.id).toBe('uid-1');
    expect(typeof result.token).toBe('string');
  });

  it('throws InvalidCredentialsError on wrong password (does not leak)', async () => {
    const passwords = new PasswordService();
    const passwordHash = await passwords.hash('the right password');
    const findByEmail = jest.fn().mockResolvedValue({
      id: 'uid-1',
      email: 'alice@example.com',
      passwordHash,
      createdAt: new Date(),
    });
    const { svc } = makeSvc({ findByEmail });
    await expect(svc.login('alice@example.com', 'WRONG')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('throws the SAME InvalidCredentialsError on unknown email (no enumeration)', async () => {
    const findByEmail = jest.fn().mockResolvedValue(null);
    const { svc } = makeSvc({ findByEmail });
    await expect(svc.login('ghost@example.com', 'anything')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('normalizes email before lookup', async () => {
    const findByEmail = jest.fn().mockResolvedValue(null);
    const { svc } = makeSvc({ findByEmail });
    await expect(svc.login('  ALICE@EXAMPLE.com  ', 'anything')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    expect(findByEmail).toHaveBeenCalledWith('alice@example.com');
  });
});

describe('AuthService.verify', () => {
  it('returns the payload for a valid token', async () => {
    const { svc, jwt } = makeSvc({});
    const token = jwt.sign({ sub: 'uid-1', email: 'alice@example.com' });
    const payload = await svc.verify(token);
    expect(payload.sub).toBe('uid-1');
    expect(payload.email).toBe('alice@example.com');
    expect(payload.iat).toBeGreaterThan(0);
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it('throws InvalidTokenError("invalid") for a malformed token', async () => {
    const { svc } = makeSvc({});
    await expect(svc.verify('not-a-real-jwt')).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('throws InvalidTokenError("expired") for an expired token', async () => {
    const expiringJwt = new JwtService({
      secret: TEST_SECRET,
      signOptions: { expiresIn: '-1s' },
    });
    const token = expiringJwt.sign({ sub: 'uid-1', email: 'a@b.c' });
    const { svc } = makeSvc({});
    await expect(svc.verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejects a token signed with a different secret', async () => {
    const otherJwt = new JwtService({ secret: 'different-secret' });
    const token = otherJwt.sign({ sub: 'uid-1', email: 'a@b.c' });
    const { svc } = makeSvc({});
    await expect(svc.verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });
});
