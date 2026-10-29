import { createZodDto } from 'nestjs-zod';
import { updateTelemetryPurposesSchema } from '#api/telemetry-purposes/telemetry-purpose.schema.js';

export class UpdateTelemetryPurposesDto extends createZodDto(updateTelemetryPurposesSchema) {}
