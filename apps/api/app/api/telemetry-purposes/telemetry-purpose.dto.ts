import { createZodDto } from 'nestjs-zod';
import {
  telemetryPurposesQuerySchema,
  updateTelemetryPurposesSchema,
} from '#api/telemetry-purposes/telemetry-purpose.schema.js';

export class UpdateTelemetryPurposesDto extends createZodDto(updateTelemetryPurposesSchema) {}

export class TelemetryPurposesQueryDto extends createZodDto(telemetryPurposesQuerySchema) {}
