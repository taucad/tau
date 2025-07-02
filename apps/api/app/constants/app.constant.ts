export const logServiceProvider = Object.freeze({
  console: 'console',
  googleLogging: 'google-logging',
  awsCloudWatch: 'aws-cloudwatch',
} as const satisfies Record<string, string>);

export type LogServiceProvider = (typeof logServiceProvider)[keyof typeof logServiceProvider];

export const orderBy = Object.freeze({
  asc: 'asc',
  desc: 'desc',
} as const satisfies Record<string, string>);

// Redact value of these paths from logs
export const loggingRedactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.email',
  'req.body.password',
  'req.body.oldPassword',
];
export const redactionCensor = '**REDACTED**';

export const defaultPageLimit = 10;
export const defaultCurrentPage = 1;
