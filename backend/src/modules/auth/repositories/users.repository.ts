import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Email is stored already-normalized (lowercased + trimmed) by the
  // service layer. Repository queries are case-sensitive and assume
  // the caller has normalized.
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: Pick<Prisma.UserCreateInput, 'email' | 'passwordHash'>): Promise<User> {
    return this.prisma.user.create({ data });
  }
}
