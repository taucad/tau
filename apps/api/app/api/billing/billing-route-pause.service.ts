import { parseArgs } from 'node:util';
import { ConflictException } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { financialEnvironmentSchema, financialIdentitySchema } from '@taucad/billing';
import { routeSkuFamily } from '#api/billing/billable-model-qualification.js';
import type { DatabaseService } from '#database/database.service.js';
import { billingRoutePause } from '#database/schema.js';

const routePauseRequestSchema = z
  .object({
    environment: financialEnvironmentSchema,
    sku: financialIdentitySchema,
    reason: z.string().trim().min(1).max(2000),
    actor: z.string().trim().min(1).max(200),
  })
  .strict();

/** One operator action on a route: who, why, and which SKU family in which environment. */
export type RoutePauseRequest = z.input<typeof routePauseRequestSchema>;

export type RoutePauseRecord = typeof billingRoutePause.$inferSelect;

export type RoutePauseCommand = {
  readonly command: 'pause-route' | 'resume-route';
  readonly request: z.output<typeof routePauseRequestSchema>;
};

/** Parses `pause-route` / `resume-route` arguments strictly; every option is required exactly once. */
export const parseRoutePauseArguments = (argv: readonly string[]): RoutePauseCommand => {
  const [command] = argv;
  if (command !== 'pause-route' && command !== 'resume-route') {
    throw new Error('Route pause commands are pause-route and resume-route');
  }
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      environment: { type: 'string' },
      sku: { type: 'string' },
      reason: { type: 'string' },
      actor: { type: 'string' },
    },
  });
  if (positionals.length !== 1 || !values.environment || !values.sku || !values.reason || !values.actor) {
    throw new Error(`Usage: ${command} --environment ENVIRONMENT --sku SKU --reason TEXT --actor TEXT`);
  }
  return {
    command,
    request: routePauseRequestSchema.parse({
      environment: values.environment,
      sku: values.sku,
      reason: values.reason,
      actor: values.actor,
    }),
  };
};

/**
 * The operator's route stop: an append-only record per SKU family and environment.
 *
 * Admission refuses a route while its latest row has no `resumed_at`. Rows are
 * never edited except to record the resume, so the table is the audit trail of
 * who stopped a route, why, and who restarted it. Only the owner identity may
 * write here; the runtime role can read but not insert or update.
 */
export class BillingRoutePauseService {
  public constructor(private readonly databaseService: Pick<DatabaseService, 'database'>) {}

  /** Pauses the SKU family; refused while the family already has an active pause. */
  public async pauseRoute(input: RoutePauseRequest): Promise<RoutePauseRecord> {
    const request = routePauseRequestSchema.parse(input);
    // Admission matches the family's base SKU, so a long-context SKU pauses its whole family.
    const [sku] = routeSkuFamily(request.sku);
    const [paused] = await this.databaseService.database
      .insert(billingRoutePause)
      .values({ environment: request.environment, sku, actor: request.actor, reason: request.reason })
      .onConflictDoNothing({
        target: [billingRoutePause.environment, billingRoutePause.sku],
        where: sql`${sql.identifier('resumed_at')} IS NULL`,
      })
      .returning();
    if (paused === undefined) {
      throw new ConflictException(`route_already_paused: ${request.environment} ${sku}`);
    }
    return paused;
  }

  /** Resumes the SKU family's active pause; refused when the family is not paused. */
  public async resumeRoute(input: RoutePauseRequest): Promise<RoutePauseRecord> {
    const request = routePauseRequestSchema.parse(input);
    const [sku] = routeSkuFamily(request.sku);
    const [resumed] = await this.databaseService.database
      .update(billingRoutePause)
      .set({ resumedAt: sql`clock_timestamp()`, resumedBy: request.actor, resumeReason: request.reason })
      .where(
        and(
          eq(billingRoutePause.environment, request.environment),
          eq(billingRoutePause.sku, sku),
          isNull(billingRoutePause.resumedAt),
        ),
      )
      .returning();
    if (resumed === undefined) {
      throw new ConflictException(`route_not_paused: ${request.environment} ${sku}`);
    }
    return resumed;
  }
}
