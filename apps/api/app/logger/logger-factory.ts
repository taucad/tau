import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';
import type { Options } from 'pino-http';
import { loggingRedactPaths, loggingRedactQueryPaths, logServiceProvider } from '#constants/app.constant.js';
import type { LogServiceProvider } from '#constants/app.constant.js';
import type { Environment } from '#config/environment.config.js';

// https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#logseverity
const pinoLevelToGoogleLoggingSeverityLookup = Object.freeze({
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
});

// ANSI color codes for better formatting
const colors = {
  reset: '\u001B[0m',
  bright: '\u001B[1m',
  dim: '\u001B[2m',
  red: '\u001B[31m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
  blue: '\u001B[34m',
  magenta: '\u001B[35m',
  cyan: '\u001B[36m',
  white: '\u001B[37m',
  bgRed: '\u001B[41m',
  bgGreen: '\u001B[42m',
  bgYellow: '\u001B[43m',
} as const;

const getMethodColor = (method: string) => {
  switch (method.toUpperCase()) {
    case 'GET': {
      return colors.green;
    }

    case 'POST': {
      return colors.blue;
    }

    case 'PUT': {
      return colors.yellow;
    }

    case 'DELETE': {
      return colors.red;
    }

    case 'PATCH': {
      return colors.magenta;
    }

    case 'OPTIONS': {
      return colors.cyan;
    }

    case 'HEAD': {
      return colors.white;
    }

    default: {
      return colors.white;
    }
  }
};

const getStatusColor = (statusCode: number) => {
  if (statusCode >= 200 && statusCode < 300) {
    return colors.green;
  }

  if (statusCode >= 300 && statusCode < 400) {
    return colors.yellow;
  }

  if (statusCode >= 400 && statusCode < 500) {
    return colors.red;
  }

  if (statusCode >= 500) {
    return colors.bgRed;
  }

  return colors.white;
};

const formatRequestId = (requestId: string) => {
  return `${colors.cyan}${requestId}${colors.reset}`;
};

/**
 * Drops the query of an OAuth callback URL so its code and state never reach a log line.
 *
 * @param url - The request URL as received (path and optional query).
 * @returns The URL unchanged, or only its path for a callback in `loggingRedactQueryPaths`.
 */
export const redactUrlQuery = (url: string): string => {
  const queryStart = url.search(/[?#]/u);
  const path = queryStart === -1 ? url : url.slice(0, queryStart);
  return queryStart !== -1 && loggingRedactQueryPaths.some((pattern) => pattern.test(path)) ? path : url;
};

const formatUrl = (rawUrl: string, isDevelopmentMode = true) => {
  const url = redactUrlQuery(rawUrl);
  if (!url) {
    return isDevelopmentMode ? `${colors.white}/${colors.reset}` : '/';
  }

  // Parse URL to separate pathname and query parameters
  try {
    const urlObject = new URL(url, 'http://localhost'); // Base URL needed for relative URLs
    const { pathname } = urlObject;
    const { searchParams } = urlObject;

    if (searchParams.toString()) {
      const queryString = searchParams.toString();
      if (isDevelopmentMode) {
        return `${colors.white}${pathname}${colors.reset}${colors.dim}?${queryString}${colors.reset}`;
      }

      return `${pathname}?${queryString}`;
    }

    return isDevelopmentMode ? `${colors.white}${pathname}${colors.reset}` : pathname;
  } catch {
    // Fallback for malformed URLs
    return isDevelopmentMode ? `${colors.white}${url}${colors.reset}` : url;
  }
};

const customSuccessMessage = (request: IncomingMessage, response: ServerResponse, responseTime: number) => {
  const isDevelopmentMode = import.meta.env.DEV;

  if (!isDevelopmentMode) {
    const url = formatUrl(request.url ?? '', false);
    return `[RES]:${request.id as string} ${request.method} ${url} ${response.statusCode} ${responseTime}ms`;
  }

  const methodColor = getMethodColor(request.method ?? '');
  const statusColor = getStatusColor(response.statusCode);
  const url = formatUrl(request.url ?? '', true);

  return [
    `${colors.bright}${colors.white}[RES]:${formatRequestId(request.id as string)}`,
    `${methodColor}${request.method}${colors.reset}`,
    `${url}`,
    `${statusColor}${response.statusCode}${colors.reset}`,
    `${colors.dim}${responseTime}ms${colors.reset}`,
  ].join(' ');
};

const customReceivedMessage = (request: IncomingMessage) => {
  const isDevelopmentMode = import.meta.env.DEV;

  if (!isDevelopmentMode) {
    const url = formatUrl(request.url ?? '', false);
    return `[REQ]:${request.id as string} ${request.method} ${url}`;
  }

  const methodColor = getMethodColor(request.method ?? '');
  // @ts-expect-error -- TODO: add typings
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-argument -- TODO: add typings
  const url = formatUrl(request.originalUrl ?? '', true);

  return [
    `${colors.bright}${colors.white}[REQ]:${formatRequestId(request.id as string)}`,
    `${methodColor}${request.method}${colors.reset}`,
    `${url}`,
  ].join(' ');
};

const customErrorMessage = (...args: Parameters<NonNullable<Options['customErrorMessage']>>) => {
  const [
    request,
    response,
    error,
    // @ts-expect-error -- Pino is missing the responseTime type
    responseTime,
  ] = args;
  const isDevelopmentMode = import.meta.env.DEV;

  if (!isDevelopmentMode) {
    const url = formatUrl(request.url ?? '', false);
    return [
      `[ERR]:${request.id as string}`,
      `${request.method}`,
      `${url}`,
      `${response.statusCode}`,
      `${error.message}`,
      `${responseTime}ms`,
    ].join(' ');
  }

  const methodColor = getMethodColor(request.method ?? '');
  const statusColor = getStatusColor(response.statusCode);
  const url = formatUrl(request.url ?? '', true);

  return [
    `${colors.bright}${colors.red}[ERR]:${formatRequestId(request.id as string)}`,
    `${methodColor}${request.method}${colors.reset}`,
    `${url}`,
    `${statusColor}${response.statusCode}${colors.reset}`,
    `${colors.red}${error.message}${colors.reset}`,
    `${colors.dim}${responseTime}ms${colors.reset}`,
  ].join(' ');
};

// oxlint-disable-next-line max-params -- pino-http callback signature
const customErrorObject = (
  _request: IncomingMessage,
  _response: ServerResponse,
  _error: Error,
  _responseTime: number,
) => {
  // We don't want to log the error object as it's handled in the `HttpExceptionFilter` logging.
  // Returning `undefined` will cause the error object to not be logged.
  return undefined;
};

function cloudwatchLoggingConfig(): Options {
  // AWS CloudWatch logging configuration is not yet implemented; default messageKey only.
  return {
    messageKey: 'message',
  };
}

function googleLoggingConfig(): Options {
  return {
    messageKey: 'message',
    formatters: {
      level(label: string, number: number) {
        const severity =
          pinoLevelToGoogleLoggingSeverityLookup[label as keyof typeof pinoLevelToGoogleLoggingSeverityLookup];
        return {
          severity,
          level: number,
        };
      },
    },
  };
}

function flyLoggingConfig(): Options {
  return {
    messageKey: 'message',
  };
}

export function consoleLoggingConfig(): Options {
  if (import.meta.env.PROD) {
    // In production, we don't want pretty logs. So we use the default pino-http options.
    return {
      messageKey: 'msg',
    };
  }

  return {
    messageKey: 'msg',
    transport: {
      target: 'pino-pretty',
      options: {
        singleLine: false,
        colorize: true,
        ignore: 'pid,hostname,req,res,responseTime,context,data,trace_id,span_id,trace_flags',
        messageFormat: `${colors.bright}{if context}${colors.yellow}[{context}] {end}${colors.reset}{if msg}{msg}{end}{if data}\n{data}{end}`,
      },
    },
  };
}

/** Custom error serializer for stack traces */
const serializeError = (error: Error) => {
  return {
    type: error.name,
    message: error.message,
    stack: error.stack,
    ...(error.cause ? { cause: error.cause } : {}),
  };
};

export function logServiceConfig(logService: LogServiceProvider): Options {
  switch (logService) {
    case logServiceProvider.googleLogging: {
      return googleLoggingConfig();
    }

    case logServiceProvider.awsCloudwatch: {
      return cloudwatchLoggingConfig();
    }

    case logServiceProvider.fly: {
      return flyLoggingConfig();
    }

    case logServiceProvider.console: {
      return consoleLoggingConfig();
    }

    default: {
      const exhaustiveCheck: never = logService;
      throw new Error(`Unknown log service: ${String(exhaustiveCheck)}`);
    }
  }
}

export async function useLoggerFactory(configService: ConfigService<Environment, true>): Promise<Params> {
  const nodeEnvironment = configService.get('NODE_ENV', { infer: true });
  const logLevel = configService.get('LOG_LEVEL', { infer: true });
  const logService = configService.get('LOG_SERVICE', { infer: true });

  // Disable logging in test environment
  const effectiveLogLevel = nodeEnvironment === 'test' ? 'silent' : logLevel;

  const serviceOptions = logServiceConfig(logService);

  const pinoHttpOptions: Options = {
    level: effectiveLogLevel,
    customSuccessMessage,
    customReceivedMessage,
    customErrorMessage,
    customErrorObject,
    serializers: {
      /** Custom error serializer for stack traces */
      err: serializeError,
      error: serializeError,
      /**
       * Receives pino's own fresh request projection, so rewriting it leaves the request untouched. The Nest
       * Fastify middleware copies the parsed query onto the raw request, so a redacted URL also drops `query`.
       */
      req(request: { url?: unknown; query?: unknown }) {
        const url = typeof request.url === 'string' ? redactUrlQuery(request.url) : request.url;
        if (url !== request.url) {
          request.url = url;
          request.query = undefined;
        }
        return request;
      },
    },
    redact: {
      paths: loggingRedactPaths,
      censor() {
        /**
         * This makes sure that the redact doesn't mutate the original object
         * And only does it on the object that is being logged,
         * It works by overriding the original censor function with a custom no-op function.
         */
      },
    }, // Redact sensitive information
    ...serviceOptions,
  };

  return {
    pinoHttp: pinoHttpOptions,
  };
}
