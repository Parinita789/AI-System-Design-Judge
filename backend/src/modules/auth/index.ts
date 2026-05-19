export { AuthModule } from './auth.module';
export { AuthService } from './services/auth.service';
export { AuthGuard } from './guards/auth.guard';
export { UsersRepository } from './repositories/users.repository';
export { Public, IS_PUBLIC_KEY } from './decorators/public.decorator';
export { CurrentUser } from './decorators/current-user.decorator';
export type {
  JwtPayload,
  AuthenticatedUser,
  AuthenticatedRequest,
  SafeUser,
} from './types/auth.types';
export {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidTokenError,
} from './errors';
