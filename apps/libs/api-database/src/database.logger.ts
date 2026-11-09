import { Logger as NestLogger } from '@nestjs/common';
import type { Logger } from 'drizzle-orm/logger';

export class SqlLogger implements Logger {
  private readonly logger = new NestLogger('SQL');
  private get isLogEnabled() {
    // Toggle to enable/disable verbose SQL logging.
    // Disabled by default as it is very noisy.
    return false;
  }

  public logQuery(query: string, parameters: unknown[]): void {
    if (this.isLogEnabled) {
      this.logger.log(`${query.trim()} | Parameters: ${JSON.stringify(parameters)}`);
    }
  }
}
