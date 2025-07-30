import { Inject, Injectable } from '@nestjs/common';
import type { betterAuth } from 'better-auth';
import { authInstanceKey } from '#constants/auth.constant.js';

type AuthInstance = ReturnType<typeof betterAuth>;

/**
 * Service solely for handling better auth related tasks.
 * This avoids circular dependencies with AuthService.
 */
@Injectable()
export class BetterAuthService {
  public constructor(@Inject(authInstanceKey) private readonly auth: AuthInstance) {}

  public get api(): AuthInstance['api'] {
    return this.auth.api;
  }
}
