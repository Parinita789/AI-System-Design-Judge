import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './handlers/auth.controller';
import { AuthService } from './services/auth.service';
import { PasswordService } from './services/password.service';
import { OwnershipService } from './services/ownership.service';
import { AuthGuard } from './guards/auth.guard';
import { UsersRepository } from './repositories/users.repository';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, OwnershipService, UsersRepository, AuthGuard],
  exports: [AuthGuard, AuthService, OwnershipService, UsersRepository],
})
export class AuthModule {}
