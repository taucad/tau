import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const apiRoot = resolve(workspaceRoot, 'apps/api');

const stopProcess = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exited = (async (): Promise<boolean> => {
    await once(child, 'exit');
    return true;
  })();
  const send = (signal: NodeJS.Signals): boolean => {
    try {
      if (process.platform !== 'win32' && child.pid) {
        process.kill(-child.pid, signal);
      } else {
        child.kill(signal);
      }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        throw error;
      }
      return false;
    }
  };

  if (!send('SIGTERM')) {
    return;
  }
  const stopped = await Promise.race([exited, delay(5000, false)]);
  if (!stopped && send('SIGKILL')) {
    await Promise.race([exited, delay(5000, false)]);
  }
};

const expectHealthyServer = async (mode: 'development' | 'production', port: number): Promise<void> => {
  const command = process.execPath;
  const args =
    mode === 'development'
      ? [
          '--env-file-if-exists=.env',
          resolve(workspaceRoot, 'node_modules/vite/bin/vite.js'),
          '--host',
          '127.0.0.1',
          '--port',
          String(port),
          '--strictPort',
        ]
      : ['dist/main.js'];
  const environment = { ...process.env };
  environment['LOG_SERVICE'] = 'console';
  environment['NODE_ENV'] = mode;
  environment['PORT'] = String(port);
  if (mode === 'production') {
    /* eslint-disable @typescript-eslint/naming-convention -- keys are external environment/credential names. */
    Object.assign(environment, {
      ANTHROPIC_API_KEY: 'sk-ant-smoke',
      AUTH_SECRET: 'smoke-secret',
      AUTH_URL: 'https://api.example.com',
      DATABASE_URL: 'postgresql://dev_user:dev_password@localhost:5432/tau_dev',
      GITHUB_CLIENT_ID: 'smoke',
      GITHUB_CLIENT_SECRET: 'smoke',
      GOOGLE_VERTEX_AI_CREDENTIALS: JSON.stringify({
        auth_provider_x509_cert_url: 'https://example.com',
        auth_uri: 'https://example.com',
        client_email: 'smoke@example.com',
        client_id: 'smoke',
        client_x509_cert_url: 'https://example.com',
        private_key: 'smoke',
        private_key_id: 'smoke',
        project_id: 'smoke',
        token_uri: 'https://example.com',
        type: 'service_account',
        universe_domain: 'example.com',
      }),
      LOG_LEVEL: 'info',
      MORPH_API_KEY: 'smoke',
      OPENAI_API_KEY: 'sk-smoke',
      REDIS_URL: 'redis://localhost:6379',
      STRIPE_PRICE_ID_PRO_MONTHLY: 'price_smoke',
      STRIPE_PRODUCT_ID_CREDIT_PACK: 'prod_smoke',
      STRIPE_SECRET_KEY: 'sk_test_smoke',
      STRIPE_WEBHOOK_SECRET: 'whsec_smoke',
      TAU_API_URL: 'https://api.example.com',
      TAU_FRONTEND_URL: 'https://app.example.com',
      TAU_S3_ACCESS_KEY_ID: 'smoke',
      TAU_S3_BUCKET: 'tau-smoke-content',
      TAU_S3_ENDPOINT: 'https://storage.example.com',
      TAU_S3_FORCE_PATH_STYLE: 'false',
      TAU_S3_PUBLIC_BASE_URL: 'https://cdn.example.com',
      TAU_S3_REGION: 'auto',
      TAU_S3_SECRET_ACCESS_KEY: 'smoke',
      TAU_TEST_MODE: '',
      TAU_VIEW_COOKIE_SECRET: 'smoke-view-cookie-secret-32chars',
      ZOO_API_KEY: 'smoke',
    });
    /* eslint-enable @typescript-eslint/naming-convention -- restore project naming checks. */
  }
  const child = spawn(command, args, {
    cwd: apiRoot,
    detached: process.platform !== 'win32',
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs: string[] = [];
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => logs.push(chunk));
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => logs.push(chunk));
  const exited = new Promise<{ code: number | undefined; signal: NodeJS.Signals | undefined }>((resolve) => {
    child.once('exit', (code, signal) => {
      resolve({ code: code ?? undefined, signal: signal ?? undefined });
    });
  });

  try {
    await once(child, 'spawn');
    let health: unknown;
    const healthy = (async (): Promise<true> => {
      await expect
        .poll(
          async () => {
            try {
              const response = await fetch(`http://127.0.0.1:${port}/health/live`, {
                signal: AbortSignal.timeout(2000),
              });
              if (!response.ok) {
                return false;
              }
              health = await response.json();
              return true;
            } catch {
              return false;
            }
          },
          { interval: 250, timeout: 180_000 },
        )
        .toBe(true);
      return true;
    })();
    const result = await Promise.race([healthy, exited]);
    if (result !== true) {
      throw new Error(`${mode} API exited with ${String(result.code ?? result.signal)}.\n${logs.join('')}`);
    }
    expect(health).toMatchObject({ status: 'ok' });
  } finally {
    await stopProcess(child);
  }
};

describe.sequential('API server modes', () => {
  it('should serve liveness through the Vite development server', async () => {
    await expectHealthyServer('development', 3210);
  });

  it('should serve liveness through the built production server', async () => {
    await expectHealthyServer('production', 3211);
  });
});
