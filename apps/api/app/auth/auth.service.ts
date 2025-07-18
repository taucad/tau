import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '~/database/database.service.js';
import { user } from '~/database/schema.js';

@Injectable()
export class AuthService {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async findUserByEmail(email: string): Promise<typeof user.$inferSelect | undefined> {
    const result = await this.databaseService.database.query.user.findFirst({
      where: eq(user.email, email),
    });

    return result;
  }

  public async findUserById(id: string): Promise<typeof user.$inferSelect | undefined> {
    const result = await this.databaseService.database.query.user.findFirst({
      where: eq(user.id, id),
    });

    return result;
  }
}
