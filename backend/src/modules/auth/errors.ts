import { ConflictException, UnauthorizedException } from '@nestjs/common';

// Signup with an email already in the users table.
export class EmailAlreadyRegisteredError extends ConflictException {
  constructor() {
    super({
      statusCode: 409,
      error: 'Conflict',
      code: 'EMAIL_ALREADY_REGISTERED',
      message: 'An account with that email already exists.',
    });
  }
}

// Single error for both "no such user" and "wrong password" — never
// leak which one. Matches industry practice; prevents email
// enumeration via the login endpoint.
export class InvalidCredentialsError extends UnauthorizedException {
  constructor() {
    super({
      statusCode: 401,
      error: 'Unauthorized',
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    });
  }
}

// Missing/expired/malformed JWT, or any verification failure. Body
// shape mirrors guardrail errors so the frontend's describeError can
// dispatch on `code` uniformly.
export class InvalidTokenError extends UnauthorizedException {
  constructor(reason: 'missing' | 'expired' | 'invalid') {
    super({
      statusCode: 401,
      error: 'Unauthorized',
      code:
        reason === 'missing'
          ? 'TOKEN_MISSING'
          : reason === 'expired'
            ? 'TOKEN_EXPIRED'
            : 'TOKEN_INVALID',
      message:
        reason === 'missing'
          ? 'Authentication required.'
          : reason === 'expired'
            ? 'Your session has expired. Please sign in again.'
            : 'Invalid authentication token.',
    });
  }
}
