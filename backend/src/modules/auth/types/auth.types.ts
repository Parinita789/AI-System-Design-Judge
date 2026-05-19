import { Request } from 'express';

// Decoded JWT contents. `sub` follows the JWT spec convention for
// "subject" — here, the user's id. `iat` and `exp` are populated by
// @nestjs/jwt automatically; we don't set them ourselves.
export interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

// What the AuthGuard attaches to `req.user`. The full JWT payload is
// kept around in case downstream code wants the email; controllers
// typically only need `id` via @CurrentUser().
export interface AuthenticatedUser {
  id: string;
  email: string;
}

// Augmented Express request shape used by guards and the
// @CurrentUser() decorator. After AuthGuard runs successfully, `user`
// is guaranteed present; routes marked @Public() will have it
// undefined.
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

// What signup/login return. Never includes passwordHash.
export interface SafeUser {
  id: string;
  email: string;
  createdAt: Date;
}
