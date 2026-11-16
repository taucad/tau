/* oxlint-disable new-cap -- NestJS decorators use PascalCase. */
/**
 * Harness H1 of the auth session cookie blueprint: a real Better Auth instance on the memory adapter with Tau's
 * static plugin set, the real `AuthModule` class mounted with that instance, the real guard and resolver, and a
 * test controller. Store reads are counted by wrapping the adapter's `findOne` for model `session`. Test code only.
 */
import { randomUUID } from 'node:crypto';
import { Controller, Get, HttpCode, Module, Post, Req, UseGuards, VersioningType } from '@nestjs/common';
import type { NestModule, Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { FastifyInstance, FastifyRequest, LightMyRequestResponse } from 'fastify';
import { betterAuth } from 'better-auth';
import type { Auth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { mockDeep } from 'vitest-mock-extended';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { MetricsService } from '@taucad/api-observability/metrics';
import { AuthGuard } from '#auth.guard.js';
import { authInstanceKey } from '#auth.constant.js';
import { AuthModule } from '#auth.module.js';
import { AuthoritativeSession, UseAuth } from '#decorators/auth.decorator.js';
import { SessionResolver } from '#session-resolver.js';
import { staticAuthConfig } from '#config/auth-static.config.js';
import { sessionCacheVersion } from '#config/better-auth.config.js';

/** The harness's base URL; plain HTTP, so cookie names carry no `__Secure-` prefix. */
export const harnessOrigin = 'http://127.0.0.1';
export const tokenCookie = 'tau.session_token';
export const dataCookie = 'tau.session_data';
export const dontRememberCookie = 'tau.dont_remember';

type AuthStore = Record<string, Array<Record<string, unknown>>>;

/** The guard sets `user` to the session's user, or to null; only `id` is read here. */
type RequestWithUser = FastifyRequest & { user?: { id?: string } };

/** A cookie jar that applies `Set-Cookie` entries in arrival order, as a browser does. */
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  public apply(setCookies: readonly string[]): void {
    for (const entry of setCookies) {
      const [pair = '', ...attributes] = entry.split(';');
      const equals = pair.indexOf('=');
      const name = pair.slice(0, equals).trim();
      const value = pair.slice(equals + 1).trim();
      const maxAge = attributes
        .map((attribute) => /^\s*max-age\s*=\s*(-?\d+)/iu.exec(attribute)?.[1])
        .find((match) => match !== undefined);
      if (maxAge !== undefined && Number.parseInt(maxAge, 10) <= 0) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  public get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  public set(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  public delete(name: string): void {
    this.cookies.delete(name);
  }

  public header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  public copy(): CookieJar {
    const jar = new CookieJar();
    for (const [name, value] of this.cookies) {
      jar.set(name, value);
    }
    return jar;
  }
}

/** `Set-Cookie` entries of an injected response, in order. */
export const setCookiesOf = (response: LightMyRequestResponse): string[] => {
  const header = response.headers['set-cookie'];
  if (header === undefined) {
    return [];
  }
  return Array.isArray(header) ? header : [header];
};

/** Names of the `Set-Cookie` entries of a response. */
export const setCookieNames = (response: LightMyRequestResponse): string[] =>
  setCookiesOf(response).map((entry) => entry.slice(0, entry.indexOf('=')));

@Controller({ path: 'cache-test', version: '1' })
@UseGuards(AuthGuard)
class CacheTestController {
  /** Fastify answers `HEAD` for this `GET` route as well. */
  @Get()
  public read(@Req() request: RequestWithUser): { userId: string | undefined } {
    return { userId: request.user?.id };
  }

  @Post()
  @HttpCode(200)
  public write(@Req() request: RequestWithUser): { userId: string | undefined } {
    return { userId: request.user?.id };
  }

  @Get('marked')
  @AuthoritativeSession()
  public marked(@Req() request: RequestWithUser): { userId: string | undefined } {
    return { userId: request.user?.id };
  }

  @Get('own-cache-control')
  public ownCacheControl(@Req() request: RequestWithUser): { userId: string | undefined } {
    void request;
    return { userId: request.user?.id };
  }
}

@Controller({ path: 'doubly-guarded', version: '1' })
@UseGuards(AuthGuard)
class DoublyGuardedController {
  @Get()
  @UseAuth()
  public read(@Req() request: RequestWithUser): { userId: string | undefined } {
    return { userId: request.user?.id };
  }

  @Post()
  @HttpCode(200)
  @UseAuth()
  public write(@Req() request: RequestWithUser): { userId: string | undefined } {
    return { userId: request.user?.id };
  }
}

export type HarnessOptions = {
  /** The flag; 0 disables the cookie cache. Default 60. */
  readonly maxAgeSeconds?: number;
  /** Shared between harnesses to model two Machines. */
  readonly secret?: string;
  /** Shared between harnesses to model one database. */
  readonly store?: AuthStore;
  /** The snapshot version; default the production constant. */
  readonly version?: string;
  /** Further controllers and providers, such as real Tau controllers with stubbed services. */
  readonly controllers?: ReadonlyArray<new (...args: never[]) => unknown>;
  readonly providers?: readonly Provider[];
  /** Run Better Auth's origin check, which it skips under `NODE_ENV=test` by default. */
  readonly originCheck?: boolean;
};

type InjectInput = {
  readonly method?: 'GET' | 'HEAD' | 'POST';
  readonly url: string;
  readonly jar?: CookieJar;
  readonly cookie?: string;
  readonly headers?: Record<string, string>;
  readonly payload?: Record<string, unknown>;
};

export type SessionCacheHarness = {
  readonly app: NestFastifyApplication;
  readonly auth: Auth;
  readonly fastify: FastifyInstance;
  readonly store: AuthStore;
  readonly metrics: DeepMockProxy<MetricsService>;
  /** The harness's resolver, for gateways under test. */
  readonly sessions: SessionResolver;
  /** Injects a request; the jar, when given, supplies the cookies and takes the response's `Set-Cookie`. */
  readonly inject: (input: InjectInput) => Promise<LightMyRequestResponse>;
  /** Signs a new user up and in; the jar holds the browser's cookies. */
  readonly signUp: (input?: { readonly rememberMe?: boolean; readonly image?: string }) => Promise<{
    jar: CookieJar;
    email: string;
    password: string;
    userId: string;
    signIn: LightMyRequestResponse;
  }>;
  readonly sessionReads: () => number;
  readonly resetReads: () => void;
  /** Deletes every session row of a user, as the operator's SQL does. */
  readonly deleteSessions: (userId: string) => void;
  /** Holds the next session read until the returned function is called. */
  readonly holdNextRead: () => () => void;
  /** Releases every read held so far, and drops a hold no read has met yet. */
  readonly releaseHeld: () => void;
  readonly close: () => Promise<void>;
};

/**
 * Boots harness H1.
 *
 * @param options - The flag, and the secret and store to share with another harness.
 * @returns The app, the instance, the store and helpers.
 */
export const createSessionCacheHarness = async (options: HarnessOptions = {}): Promise<SessionCacheHarness> => {
  const maxAgeSeconds = options.maxAgeSeconds ?? 60;
  const store: AuthStore = options.store ?? {
    user: [],
    session: [],
    account: [],
    verification: [],
    apikey: [],
    subscription: [],
    deviceCode: [],
  };
  let sessionReads = 0;
  let held: Promise<void> | undefined;
  const releases: Array<() => void> = [];
  const base = memoryAdapter(store);
  const database: typeof base = (adapterOptions) => {
    const adapter = base(adapterOptions);
    return {
      ...adapter,
      findOne: async (args) => {
        if (args.model === 'session') {
          sessionReads += 1;
          const gate = held;
          held = undefined;
          if (gate !== undefined) {
            await gate;
          }
        }
        return adapter.findOne(args);
      },
    };
  };
  const auth = betterAuth({
    ...staticAuthConfig,
    baseURL: harnessOrigin,
    database,
    secret: options.secret ?? 'session-cache-harness-secret-32-characters',
    rateLimit: { enabled: false },
    ...(options.originCheck === true ? { advanced: { ...staticAuthConfig.advanced, disableOriginCheck: false } } : {}),
    emailAndPassword: { ...staticAuthConfig.emailAndPassword, requireEmailVerification: false },
    emailVerification: { ...staticAuthConfig.emailVerification, sendOnSignIn: false, sendOnSignUp: false },
    session: {
      ...staticAuthConfig.session,
      cookieCache:
        maxAgeSeconds > 0
          ? { enabled: true, maxAge: maxAgeSeconds, strategy: 'jwe', version: options.version ?? sessionCacheVersion }
          : { enabled: false },
    },
  });
  const metrics = mockDeep<MetricsService>();

  @Module({
    imports: [DiscoveryModule],
    controllers: [CacheTestController, DoublyGuardedController, ...(options.controllers ?? [])],
    providers: [
      ...(options.providers ?? []),
      AuthModule,
      AuthGuard,
      SessionResolver,
      { provide: authInstanceKey, useValue: auth },
      { provide: MetricsService, useValue: metrics },
    ],
  })
  class HarnessModule implements NestModule {
    public constructor(private readonly authModule: AuthModule) {}

    public configure(): void {
      this.authModule.configure();
    }
  }

  const moduleRef = await Test.createTestingModule({ imports: [HarnessModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.enableVersioning({ type: VersioningType.URI });
  const fastify: FastifyInstance = app.getHttpAdapter().getInstance();
  // A handler that sets its own Cache-Control (the guard's default must not replace it).
  fastify.addHook('onSend', async (request, reply, payload) => {
    if (request.url.endsWith('/own-cache-control')) {
      void reply.header('cache-control', 'private, max-age=5');
    }
    return payload;
  });
  await app.init();
  await fastify.ready();

  const inject = async (input: InjectInput): Promise<LightMyRequestResponse> => {
    const cookie = input.cookie ?? input.jar?.header();
    const response = await fastify.inject({
      method: input.method ?? 'GET',
      url: input.url,
      headers: {
        ...(cookie === undefined || cookie === '' ? {} : { cookie }),
        ...(input.method === 'POST' && input.url.startsWith('/v1/auth/') ? { origin: harnessOrigin } : {}),
        ...input.headers,
      },
      ...(input.payload === undefined ? {} : { payload: input.payload }),
    });
    input.jar?.apply(setCookiesOf(response));
    return response;
  };

  let accounts = 0;
  const signUp = async (input: { readonly rememberMe?: boolean; readonly image?: string } = {}) => {
    accounts += 1;
    const email = `session-cache-${String(accounts)}-${randomUUID()}@example.test`;
    const password = 'correct horse battery staple';
    const jar = new CookieJar();
    const signUpResponse = await inject({
      method: 'POST',
      url: '/v1/auth/sign-up/email',
      payload: { email, password, name: 'Session Cache', ...(input.image === undefined ? {} : { image: input.image }) },
    });
    const userId = signUpResponse.json<{ user: { id: string } }>().user.id;
    const signIn = await inject({
      method: 'POST',
      url: '/v1/auth/sign-in/email',
      jar,
      payload: { email, password, ...(input.rememberMe === undefined ? {} : { rememberMe: input.rememberMe }) },
    });
    return { jar, email, password, userId, signIn };
  };

  return {
    app,
    auth: auth as unknown as Auth,
    fastify,
    store,
    metrics,
    sessions: moduleRef.get(SessionResolver),
    inject,
    signUp,
    sessionReads: (): number => sessionReads,
    resetReads: (): void => {
      sessionReads = 0;
    },
    deleteSessions: (userId: string): void => {
      const rows = store['session'] ?? [];
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index]?.['userId'] === userId) {
          rows.splice(index, 1);
        }
      }
    },
    holdNextRead: (): (() => void) => {
      let release!: () => void;
      held = new Promise<void>((resolve) => {
        release = resolve;
      });
      releases.push(release);
      return release;
    },
    releaseHeld: (): void => {
      held = undefined;
      for (const release of releases.splice(0)) {
        release();
      }
    },
    close: async (): Promise<void> => {
      await app.close();
    },
  };
};
