import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

// bcrypt has a 72-byte input ceiling. The signup DTO caps password
// at 72 chars to avoid silent truncation; this service trusts that
// cap and doesn't re-validate.
const BCRYPT_ROUNDS = 12;

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  compare(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  }
}
