/* eslint-disable @typescript-eslint/naming-convention -- Configuration fixtures retain their environment key names. */
import { ConfigService } from '@nestjs/config';
import { RequestMethod } from '@nestjs/common';
import type { INestApplication, Type } from '@nestjs/common';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { MetadataScanner } from '@nestjs/core/metadata-scanner.js';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { mockDeep } from 'vitest-mock-extended';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '#app.module.js';
import { AuthModule } from '#auth/auth.module.js';
import { isOptionalAuth, isPublicAuth } from '#constants/auth.constant.js';
import { DatabaseService } from '#database/database.service.js';
import { getEnvironment } from '@taucad/api-core';

/**
 * HTTP surface guard. Pins every route the API serves (method, versioned path,
 * guards and auth mode) in both server modes, so a refactor that moves modules
 * between projects cannot drop, duplicate or re-guard a route without a
 * reviewed snapshot change.
 *
 * Two sources, because the API registers routes two ways:
 * - Nest controllers: read from decorator metadata on every controller in the
 *   compiled module graph, the same metadata `RoutesResolver` reads at init.
 * - Raw Fastify routes: `AuthModule.configure()` registers the Better Auth
 *   wildcard and, in cloud mode, the byte-exact Stripe webhook directly on the
 *   Fastify instance. They are read back from Fastify's own route table.
 *
 * Like `app.module.test.ts`, nothing connects: `compile()` runs constructors
 * only, and `init()` is never called, so no `onModuleInit` fires.
 */

type ControllerRoute = {
  method: string;
  path: string;
  version: string;
  guards: string;
  auth: 'public' | 'optional' | 'required';
  handler: string;
};

const asList = (value: unknown): string[] => {
  if (value === undefined) {
    return [];
  }
  return (Array.isArray(value) ? value : [value]).map(String);
};

const joinPath = (...segments: string[]): string => {
  const joined = segments
    .flatMap((segment) => segment.split('/'))
    .filter(Boolean)
    .join('/');
  return `/${joined}`;
};

type MetadataTarget = Type | ((...arguments_: unknown[]) => unknown);

// Nest's own metadata keys (`@nestjs/common/constants`), spelled out because the deep import is untyped.
const pathMetadata = 'path';
const methodMetadata = 'method';
const versionMetadata = '__version__';
const guardsMetadata = '__guards__';

const reflector = new Reflector();
const read = (key: string, target: MetadataTarget): unknown => reflector.get<unknown>(key, target);

const guardNames = (target: MetadataTarget): string[] =>
  asList(
    (read(guardsMetadata, target) as unknown[] | undefined)?.map((guard) =>
      typeof guard === 'function' ? guard.name : String((guard as { constructor: { name: string } }).constructor.name),
    ),
  );

function handlerRoutes(controller: Type, name: string, handler: MetadataTarget): ControllerRoute[] {
  const handlerPaths = read(pathMetadata, handler);
  if (handlerPaths === undefined) {
    return [];
  }
  const controllerPaths = asList(read(pathMetadata, controller));
  const handlerVersions = asList(read(versionMetadata, handler));
  const versions = handlerVersions.length > 0 ? handlerVersions : asList(read(versionMetadata, controller));
  const isPublic = read(isPublicAuth, handler) ?? read(isPublicAuth, controller);
  const isOptional = read(isOptionalAuth, handler) ?? read(isOptionalAuth, controller);
  const auth: ControllerRoute['auth'] = isPublic === true ? 'public' : isOptional === true ? 'optional' : 'required';
  const base = {
    method: RequestMethod[read(methodMetadata, handler) as RequestMethod],
    version: versions.length > 0 ? versions.join(',') : '-',
    guards: [...guardNames(controller), ...guardNames(handler)].join(',') || '-',
    auth,
    handler: `${controller.name}.${name}`,
  };
  return (controllerPaths.length > 0 ? controllerPaths : ['']).flatMap((controllerPath) =>
    asList(handlerPaths).map((handlerPath) => ({ ...base, path: joinPath(controllerPath, handlerPath) })),
  );
}

function controllerRoutes(moduleRef: TestingModule): ControllerRoute[] {
  const scanner = new MetadataScanner();
  const controllers = new Set<Type>();
  for (const module of moduleRef.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      if (wrapper.metatype) {
        controllers.add(wrapper.metatype as Type);
      }
    }
  }
  return [...controllers].flatMap((controller) => {
    const prototype = controller.prototype as Record<string, MetadataTarget>;
    return scanner.getAllMethodNames(prototype).flatMap((name) => handlerRoutes(controller, name, prototype[name]!));
  });
}

async function fastifyRoutes(app: NestFastifyApplication): Promise<string[]> {
  app.get(AuthModule, { strict: false }).configure();
  const instance = app.getHttpAdapter().getInstance();
  const routes: string[] = [];
  instance.addHook('onRoute', (route) => {
    for (const method of asList(route.method)) {
      if (method !== 'HEAD') {
        routes.push(`${method} ${route.url}`);
      }
    }
  });
  // Routes registered before the hook (the auth wildcard is synchronous) are
  // read with hasRoute below; plugin-scoped ones (the webhook) arrive on ready.
  await instance.ready();
  const authBase = '/v1/auth';
  for (const method of ['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT']) {
    if (instance.hasRoute({ url: `${authBase}/*`, method: method as 'GET' })) {
      routes.push(`${method} ${authBase}/*`);
    }
  }
  return [...new Set(routes)].toSorted();
}

const format = (controller: ControllerRoute[], raw: string[]): string =>
  [
    '# Nest controller routes: METHOD path | version | guards | auth | handler',
    ...controller
      .map((route) =>
        [`${route.method} ${route.path}`, `v${route.version}`, route.guards, route.auth, route.handler].join(' | '),
      )
      .toSorted(),
    '',
    '# Raw Fastify routes registered outside Nest controllers',
    ...raw,
    '',
  ].join('\n');

describe('HTTP route table', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('should keep the self-host route table unchanged', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ ...getEnvironment(), TAU_CLOUD_ENABLED: false })],
    }).compile();
    const fastifyApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    app = fastifyApp;
    const raw = await fastifyRoutes(fastifyApp);
    await expect(format(controllerRoutes(moduleRef), raw)).toMatchFileSnapshot(
      './__snapshots__/http-route-table.self-host.txt',
    );
  });

  it('should keep the cloud route table unchanged', async () => {
    const config = new ConfigService({
      ...getEnvironment(),
      BILLING_ENVIRONMENT: 'staging',
      STRIPE_ACCOUNT_ID: 'acct_route_fixture',
      STRIPE_LIVEMODE: false,
      STRIPE_SECRET_KEY: 'sk_test_route',
      STRIPE_READ_SECRET_KEY: 'rk_test_route',
      STRIPE_WEBHOOK_SECRET: 'whsec_route_fixture',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_route_fixture',
      STRIPE_PRODUCT_ID_CREDIT_PACK: 'prod_route_fixture',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ ...getEnvironment(), TAU_CLOUD_ENABLED: true })],
    })
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideProvider(DatabaseService)
      .useValue(mockDeep<DatabaseService>())
      .compile();
    const fastifyApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    app = fastifyApp;
    const raw = await fastifyRoutes(fastifyApp);
    await expect(format(controllerRoutes(moduleRef), raw)).toMatchFileSnapshot(
      './__snapshots__/http-route-table.cloud.txt',
    );
  });
});
