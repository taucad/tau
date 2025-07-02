import type { IncomingMessage, ServerResponse } from 'node:http';
import process from 'node:process';
import type { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';
import type { Options } from 'pino-http';
import type { PrettyOptions } from 'pino-pretty';
import { loggingRedactPaths, logServiceProvider } from '~/constants/app.constant.js';
import type { LogServiceProvider } from '~/constants/app.constant.js';
import type { Environment } from '~/config/environment.config.js';

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
  switch (method?.toUpperCase()) {
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
  if (statusCode >= 200 && statusCode < 300) return colors.green;
  if (statusCode >= 300 && statusCode < 400) return colors.yellow;
  if (statusCode >= 400 && statusCode < 500) return colors.red;
  if (statusCode >= 500) return colors.bgRed;
  return colors.white;
};

const formatRequestId = (requestId: string) => {
  return `${colors.cyan}${requestId}${colors.reset}`;
};

const formatUrl = (url: string, isDevMode = true) => {
  if (!url) return isDevMode ? `${colors.white}/${colors.reset}` : '/';

  // Parse URL to separate pathname and query parameters
  try {
    const urlObject = new URL(url, 'http://localhost'); // Base URL needed for relative URLs
    const { pathname } = urlObject;
    const { searchParams } = urlObject;

    if (searchParams.toString()) {
      const queryString = searchParams.toString();
      if (isDevMode) {
        return `${colors.white}${pathname}${colors.reset}${colors.dim}?${queryString}${colors.reset}`;
      }

      return `${pathname}?${queryString}`;
    }

    return isDevMode ? `${colors.white}${pathname}${colors.reset}` : pathname;
  } catch {
    // Fallback for malformed URLs
    return isDevMode ? `${colors.white}${url}${colors.reset}` : url;
  }
};

const customSuccessMessage = (request: IncomingMessage, response: ServerResponse, responseTime: number) => {
  const isDevMode = import.meta.env.DEV;

  if (!isDevMode) {
    const url = formatUrl(request.url ?? '', false);
    return `[RES]:${request.id as string} ${request.method} ${url} ${response.statusCode} ${responseTime}ms`;
  }

  const methodColor = getMethodColor(request.method ?? '');
  const statusColor = getStatusColor(response.statusCode ?? 0);
  const url = formatUrl(request.url ?? '', true);

  return `${colors.bright}${colors.white}[RES]:${formatRequestId(request.id as string)} ${methodColor}${request.method}${colors.reset} ${url} ${statusColor}${response.statusCode}${colors.reset} ${colors.dim}${responseTime}ms${colors.reset}`;
};

const customReceivedMessage = (request: IncomingMessage) => {
  const isDevMode = import.meta.env.DEV;

  if (!isDevMode) {
    const url = formatUrl(request.url ?? '', false);
    return `[REQ]:${request.id as string} ${request.method} ${url}`;
  }

  const methodColor = getMethodColor(request.method ?? '');
  // @ts-expect-error -- TODO: add typings
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- TODO: add typings
  const url = formatUrl(request.originalUrl ?? '', true);

  return `${colors.bright}${colors.white}[REQ]:${formatRequestId(request.id as string)} ${methodColor}${request.method}${colors.reset} ${url}`;
};

const customErrorMessage = (request: IncomingMessage, response: ServerResponse, error: Error) => {
  const isDevMode = import.meta.env.DEV;

  if (!isDevMode) {
    const url = formatUrl(request.url ?? '', false);
    return `[ERR]:${request.id as string} ${request.method} ${url} ${response.statusCode} ${error.message}`;
  }

  const methodColor = getMethodColor(request.method ?? '');
  const statusColor = getStatusColor(response.statusCode ?? 0);
  const url = formatUrl(request.url ?? '', true);

  return `${colors.bright}${colors.red}[ERR]:${formatRequestId(request.id as string)} ${methodColor}${request.method}${colors.reset} ${url} ${statusColor}${response.statusCode}${colors.reset} ${colors.red}${error.message}${colors.reset}`;
};

function logServiceConfig(logService: LogServiceProvider): Options {
  switch (logService) {
    case logServiceProvider.googleLogging: {
      return googleLoggingConfig();
    }

    case logServiceProvider.awsCloudwatch: {
      return cloudwatchLoggingConfig();
    }

    case logServiceProvider.console: {
      return consoleLoggingConfig();
    }

    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- exhaustive switch is required for exhaustive switch
    default: {
      const exhaustiveCheck: never = logService;
      throw new Error(`Unknown log service: ${String(exhaustiveCheck)}`);
    }
  }
}

function cloudwatchLoggingConfig(): Options {
  // FIXME: Implement AWS CloudWatch logging configuration
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
          pinoLevelToGoogleLoggingSeverityLookup[label as keyof typeof pinoLevelToGoogleLoggingSeverityLookup] ??
          pinoLevelToGoogleLoggingSeverityLookup.info;
        return {
          severity,
          level: number,
        };
      },
    },
  };
}

function consoleLoggingConfig(): Options {
  if (import.meta.env.PROD) {
    // In production, we don't want pretty logs. So we use the default pino-http options.
    return {
      messageKey: 'msg',
    };
  }

  const options: PrettyOptions = {
    singleLine: true,
    colorize: true,
    ignore: 'pid,hostname,req,res,responseTime,context',
    messageFormat: `${colors.bright}{if context}${colors.yellow}[{context}] {end}${colors.reset}{if msg}{msg}{end}`,
  };

  return {
    messageKey: 'msg',
    transport: {
      target: 'pino-pretty',
      options,
    },
  };
}

export function getPinoLoggingConfig(): Options | boolean {
  const envToLogger: Record<`${Environment['NODE_ENV']}`, Options | boolean> = {
    development: consoleLoggingConfig(),
    production: true, // In production, we don't want pretty logs. So we use the default pino-http options.
    test: false, // In test mode, disable logs.
  } as const;

  // We use process.env here as the config service is not available when this function is called, during app bootstrap.
  const environment = process.env.NODE_ENV;

  return envToLogger[environment];
}

export async function useLoggerFactory(configService: ConfigService<Environment, true>): Promise<Params> {
  const logLevel = configService.get('LOG_LEVEL', { infer: true });
  const logService = configService.get('LOG_SERVICE', { infer: true });

  const serviceOptions = logServiceConfig(logService);

  const pinoHttpOptions: Options = {
    level: logLevel,
    customSuccessMessage,
    customReceivedMessage,
    customErrorMessage,
    redact: {
      paths: loggingRedactPaths,
      censor() {
        /**
         * This makes sure that the redact doesn't mutate the original object
         * And only does it on the object that is being logged,
         * It's strange but it works. No return value needed.
         */
      },
    }, // Redact sensitive information
    ...serviceOptions,
  };

  return {
    pinoHttp: pinoHttpOptions,
  };
}
