import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createTestApiSchema = z
  .object({
    id: z.string(),
    type: z.enum(['test']),
  })
  .meta({ id: 'CreateTestApi' });

export const testApiSchema = createTestApiSchema.extend({
  id: z.string(),
  name: z.string(),
});

export class CreateTestApiDto extends createZodDto(createTestApiSchema) {}

export class TestApiDto extends createZodDto(testApiSchema) {}
