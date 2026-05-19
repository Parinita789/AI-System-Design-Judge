import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { UsersRepository } from '../repositories/users.repository';
import { PasswordService } from './password.service';
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidTokenError,
} from '../errors';
import { JwtPayload, SafeUser } from '../types/auth.types';

export interface AuthResult {
  user: SafeUser;
  token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  async signup(email: string, password: string): Promise<AuthResult> {
    const normalized = normalizeEmail(email);
    const existing = await this.users.findByEmail(normalized);
    if (existing) throw new EmailAlreadyRegisteredError();
    const passwordHash = await this.passwords.hash(password);
    // The check above is best-effort: between findByEmail and create
    // another request could insert the same email. The DB's unique
    // constraint on users.email catches that — Prisma surfaces it as
    // P2002, which we translate back to our 409 EmailAlreadyRegisteredError
    // so the API contract stays honest under concurrency. Non-P2002
    // failures (connection drop, etc.) propagate as-is.
    let user;
    try {
      user = await this.users.create({ email: normalized, passwordHash });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) throw new EmailAlreadyRegisteredError();
      throw err;
    }
    return { user: toSafeUser(user), token: this.signToken(user) };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const normalized = normalizeEmail(email);
    const user = await this.users.findByEmail(normalized);
    // Single error path for both "no user" and "wrong password" so
    // attackers can't enumerate registered emails via timing or
    // status-code differences. We still run bcrypt.compare on a dummy
    // hash when the user is missing to keep the timing constant —
    // a fast 401 on missing-user vs. slow 401 on wrong-password is a
    // textbook side channel.
    if (!user) {
      await this.passwords.compare(password, DUMMY_BCRYPT_HASH);
      throw new InvalidCredentialsError();
    }
    const ok = await this.passwords.compare(password, user.passwordHash);
    if (!ok) throw new InvalidCredentialsError();
    return { user: toSafeUser(user), token: this.signToken(user) };
  }

  // Verifies a token and returns its payload, or throws
  // InvalidTokenError. JwtService throws TokenExpiredError /
  // JsonWebTokenError under the hood; we translate to our error shape
  // so the frontend can dispatch on `code`.
  async verify(token: string): Promise<JwtPayload> {
    try {
      return await this.jwt.verifyAsync<JwtPayload>(token);
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'TokenExpiredError') throw new InvalidTokenError('expired');
      throw new InvalidTokenError('invalid');
    }
  }

  private signToken(user: User): string {
    const payload: Pick<JwtPayload, 'sub' | 'email'> = {
      sub: user.id,
      email: user.email,
    };
    return this.jwt.sign(payload);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Prisma surfaces unique-constraint violations as PrismaClientKnownRequestError
// with code 'P2002'. Checking the code property keeps this trivially mockable
// from tests; matches the pattern used by OrchestratorService.
function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

function toSafeUser(user: User): SafeUser {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

// A real bcrypt hash of "unreachable-sentinel" at cost 12. Used by
// login() to keep timing constant when the email doesn't exist —
// bcrypt.compare against this still spends ~100ms on the 12-round
// salt, matching the real-user timing. The plaintext is intentionally
// not a common password; even if known, it doesn't grant access to
// anything (no row in the users table hashes from this plaintext).
const DUMMY_BCRYPT_HASH = '$2b$12$Lj/hcpObnBO5cvDxn0fMfecQVJzCF0/R15EIoplpYwCNcb.ZlOSWK';
