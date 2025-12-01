import { Body, Controller, Logger, Post } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { CreateTestApiDto, TestApiDto } from '#api/test-api/test-api.dto.js';

/**
 * This controller is used to test the API.
 *
 * It can be used to test API features like validation, exception handling, etc.
 * without depending on concrete API features.
 */
@Controller({ path: 'test-api', version: '1' })
export class TestApiController {
  public readonly logger = new Logger(TestApiController.name);

  @Post('test')
  @ZodSerializerDto(TestApiDto)
  public async test(@Body() body: CreateTestApiDto): Promise<TestApiDto> {
    return {
      id: body.id,
      type: body.type,
      name: 'Test',

      // @ts-expect-error - Testing that the extra fields are stripped
      password: '123456',
    };
  }
}
