import { VersioningType } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '#app.module.js';
import { DatabaseService } from '#database/database.service.js';

// Mock DatabaseService for tests that don't need database access
const mockDatabaseService = {
  database: {},
  onModuleInit: () => undefined,
  onModuleDestroy: () => undefined,
};

describe('TestApiController (e2e)', () => {
  let app: NestFastifyApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.enableVersioning({
      type: VersioningType.URI,
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /v1/test-api/test', () => {
    it('should accept valid request and return 201', async () => {
      // Arrange
      const validPayload = {
        id: 'test-123',
        type: 'test',
      };

      // Act
      const result = await app.inject({
        method: 'POST',
        url: '/v1/test-api/test',
        payload: validPayload,
        headers: {
          'content-type': 'application/json',
        },
      });

      // Assert
      expect(result.statusCode).toEqual(201);
    });

    it('should handle different valid test IDs', async () => {
      // Arrange
      const validPayload = {
        id: 'another-test-456',
        type: 'test',
      };

      // Act
      const result = await app.inject({
        method: 'POST',
        url: '/v1/test-api/test',
        payload: validPayload,
        headers: {
          'content-type': 'application/json',
        },
      });

      // Assert
      expect(result.statusCode).toEqual(201);
    });

    it('should reject request with missing id field', async () => {
      // Arrange
      const invalidPayload = {
        type: 'test',
      };

      // Act
      const result = await app.inject({
        method: 'POST',
        url: '/v1/test-api/test',
        payload: invalidPayload,
        headers: {
          'content-type': 'application/json',
        },
      });

      // Assert
      expect(result.statusCode).toEqual(400);
      const response = JSON.parse(result.payload) as { error: string; message: string[] };
      expect(response.error).toEqual('Validation failed');
      expect(response.message).toEqual(['id: Invalid input: expected string, received undefined']);
    });

    it('should reject request with invalid id type', async () => {
      // Arrange
      const invalidPayload = {
        id: 123, // Should be string
        type: 'test',
      };

      // Act
      const result = await app.inject({
        method: 'POST',
        url: '/v1/test-api/test',
        payload: invalidPayload,
        headers: {
          'content-type': 'application/json',
        },
      });

      // Assert
      expect(result.statusCode).toEqual(400);
      const response = JSON.parse(result.payload) as { error: string; message: string[] };
      expect(response.error).toEqual('Validation failed');
      expect(response.message).toEqual(['id: Invalid input: expected string, received number']);
    });

    it('should reject request with missing type field', async () => {
      // Arrange
      const invalidPayload = {
        id: 'test-123',
      };

      // Act
      const result = await app.inject({
        method: 'POST',
        url: '/v1/test-api/test',
        payload: invalidPayload,
        headers: {
          'content-type': 'application/json',
        },
      });

      // Assert
      expect(result.statusCode).toEqual(400);
      const response = JSON.parse(result.payload) as { error: string; message: string[] };
      expect(response.error).toEqual('Validation failed');
      expect(response.message).toEqual(['type: Invalid input: expected "test"']);
    });

    it('should reject request with invalid type value', async () => {
      // Arrange
      const invalidPayload = {
        id: 'test-123',
        type: 'invalid-type', // Should be 'test'
      };

      // Act
      const result = await app.inject({
        method: 'POST',
        url: '/v1/test-api/test',
        payload: invalidPayload,
        headers: {
          'content-type': 'application/json',
        },
      });

      // Assert
      expect(result.statusCode).toEqual(400);
      const response = JSON.parse(result.payload) as { error: string; message: string[] };
      expect(response.error).toEqual('Validation failed');
      expect(response.message).toEqual(['type: Invalid input: expected "test"']);
    });

    it('should reject request with invalid type type', async () => {
      // Arrange
      const invalidPayload = {
        id: 'test-123',
        type: 123, // Should be string enum 'test'
      };

      // Act
      const result = await app.inject({
        method: 'POST',
        url: '/v1/test-api/test',
        payload: invalidPayload,
        headers: {
          'content-type': 'application/json',
        },
      });

      // Assert
      expect(result.statusCode).toEqual(400);
      const response = JSON.parse(result.payload) as { error: string; message: string[] };
      expect(response.error).toEqual('Validation failed');
      expect(response.message).toEqual(['type: Invalid input: expected "test"']);
    });

    it('should reject request with empty object', async () => {
      // Arrange
      const invalidPayload = {};

      // Act
      const result = await app.inject({
        method: 'POST',
        url: '/v1/test-api/test',
        payload: invalidPayload,
        headers: {
          'content-type': 'application/json',
        },
      });

      // Assert
      expect(result.statusCode).toEqual(400);
      const response = JSON.parse(result.payload) as { error: string; message: string[] };
      expect(response.error).toEqual('Validation failed');
      expect(response.message).toEqual([
        'id: Invalid input: expected string, received undefined',
        'type: Invalid input: expected "test"',
      ]);
    });

    it('should strip extra fields from request', async () => {
      // Arrange
      const payloadWithExtraFields = {
        id: 'test-123',
        type: 'test',
        extraField: 'should-be-stripped',
      };

      // Act
      const result = await app.inject({
        method: 'POST',
        url: '/v1/test-api/test',
        payload: payloadWithExtraFields,
        headers: {
          'content-type': 'application/json',
        },
      });

      // Assert - should succeed because extra fields are stripped
      expect(result.statusCode).toEqual(201);
    });

    it('should strip password field from response via ZodSerializerDto', async () => {
      // Arrange
      const validPayload = {
        id: 'test-456',
        type: 'test',
      };

      // Act
      const result = await app.inject({
        method: 'POST',
        url: '/v1/test-api/test',
        payload: validPayload,
        headers: {
          'content-type': 'application/json',
        },
      });

      // Assert
      expect(result.statusCode).toEqual(201);
      const response = JSON.parse(result.payload) as { id: string; type: string; name: string; password?: string };

      // Verify expected fields are present
      expect(response.id).toEqual('test-456');
      expect(response.type).toEqual('test');
      expect(response.name).toEqual('Test');

      // Verify password field is stripped by ZodSerializerDto
      expect(response.password).toBeUndefined();
      expect(Object.keys(response)).not.toContain('password');
    });
  });
});
