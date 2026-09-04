import type { Express } from 'express';
import express from 'express';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeSync as fsWriteSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { isIPv4 } from 'node:net';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createRequestHandler } from '@react-router/express';
import type { ServerBuild } from 'react-router';
import { coiMiddleware } from '@taucad/runtime/cross-origin-isolation/express';
import qrcodeTerminal from 'qrcode-terminal';

import {
  formatIosTrustBanner,
  formatQrCaption,
  indentBannerBlock,
  readDevRootCommonName,
} from '#lib/certificates/dev-ca-banner.js';
import { httpsCaPemPath, httpsCertPemPath, httpsKeyPemPath } from '#lib/certificates/https-certs-path.js';
import type { HostArgument } from '#lib/server-args.js';
import { parseHostArgument, parseHttpsArgument } from '#lib/server-args.js';

const port = Number.parseInt(process.env['PORT'] ?? '3000', 10);

const formatServeUrl = (scheme: 'http' | 'https', hostname: string, listenPort: number): string =>
  hostname.includes(':') ? `${scheme}://[${hostname}]:${listenPort}` : `${scheme}://${hostname}:${listenPort}`;

const getLanIpv4ServeUrls = (scheme: 'http' | 'https', listenPort: number): readonly string[] => {
  const nets = networkInterfaces();
  const urls: string[] = [];
  const names = Object.keys(nets);
  for (const name of names) {
    const entries = nets[name];
    if (!entries) {
      continue;
    }

    for (const entry of entries) {
      if (entry.internal || !isIPv4(entry.address)) {
        continue;
      }

      const octets = entry.address.split('.');
      /** Link-local IPv4 (APIPA): exclude from LAN list (Vite resolvesServerUrls behavior). */
      if (octets[0] === '169' && octets[1] === '254') {
        continue;
      }

      urls.push(formatServeUrl(scheme, entry.address, listenPort));
    }
  }

  return urls;
};

/**
 * Lines to print after `Local:` when `--host` was passed: either one explicit URL or all LAN IPv4 URLs for wildcard bind.
 */
export const getServeNetworkUrls = (
  listenPort: number,
  hostFromArgv: HostArgument,
  scheme: 'http' | 'https',
): readonly string[] => {
  if (hostFromArgv === undefined) {
    return [];
  }

  if (hostFromArgv === '0.0.0.0' || hostFromArgv === '::') {
    return getLanIpv4ServeUrls(scheme, listenPort);
  }

  return [formatServeUrl(scheme, hostFromArgv, listenPort)];
};

/** Plain-HTTP dev-CA QR targets a phone reachable address (not loopback). */
const isPhoneReachableLanCaUrl = (caUrl: string): boolean =>
  !(caUrl.includes('127.0.0.1') || caUrl.includes('localhost') || caUrl.includes('[::1]'));

const terminalQrUtf8Small = async (payload: string): Promise<string> =>
  new Promise<string>((resolve) => {
    qrcodeTerminal.generate(payload, { small: true }, (qrAscii: string) => {
      resolve(qrAscii);
    });
  });

type IosServeTrustQrParams = {
  readonly baseHttpUrls: readonly string[];
  readonly extraLanCaUrls: readonly string[];
  readonly extraLanHttpsUrls: readonly string[];
  readonly primaryCaUrl: string;
  readonly primaryHttpsUrl: string;
};

/**
 * Emit `payload` to stdout one line at a time via blocking `fs.writeSync(1, …)`.
 *
 * Why not `process.stdout.write`? Node's TTY WriteStream sends bytes through
 * libuv's async tty handle, which loops over `write(2)` and can return short
 * when the terminal's input queue is full. If a short write lands inside a
 * 3-byte UTF-8 codepoint (every QR `█`/`▀`/`▄` and every divider `─` is 3
 * bytes) the leader byte arrives in one chunk and its continuation bytes in
 * the next, so iTerm/Terminal.app decode them as orphan bytes → U+FFFD. Going
 * via `fs.writeSync` issues a single blocking syscall per line; lines are
 * <100 bytes (well under any TTY accept threshold) and end on `\n`, so any
 * short write happens at a line boundary, never mid-codepoint.
 */
const writeStdoutLineByLineSync = (payload: string): void => {
  const lines = payload.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const isLast = i === lines.length - 1;
    const lineWithNewline = isLast ? lines[i]! : `${lines[i]!}\n`;
    if (lineWithNewline.length === 0) {
      continue;
    }
    const buffer = Buffer.from(lineWithNewline, 'utf8');
    let offset = 0;
    while (offset < buffer.length) {
      offset += fsWriteSync(1, buffer, offset, buffer.length - offset);
    }
  }
};

const emitTauServeCompanionPlainCaHints = (baseHttpUrls: readonly string[]): void => {
  for (const baseUrl of baseHttpUrls) {
    // oxlint-disable-next-line no-console -- server boot log
    console.log(`[tau-serve] LAN CA attach (plain HTTP): ${baseUrl}/_dev/ca.crt`);
  }
};

const emitIosTrustQrBannerOrCompanionHints = async (params: IosServeTrustQrParams): Promise<void> => {
  try {
    const rootCommonName = readDevRootCommonName(httpsCaPemPath);
    const { header, steps } = formatIosTrustBanner({
      httpsUrl: params.primaryHttpsUrl,
      rootCommonName,
    });

    const [caQrAscii, httpsQrAscii] = await Promise.all([
      terminalQrUtf8Small(params.primaryCaUrl),
      terminalQrUtf8Small(params.primaryHttpsUrl),
    ]);

    const caCaption = formatQrCaption({
      extraUrls: params.extraLanCaUrls,
      headline: 'Step 1: install dev CA (HTTP)',
      url: params.primaryCaUrl,
    });

    const httpsCaption = formatQrCaption({
      extraUrls: params.extraLanHttpsUrls,
      headline: 'Step 4: open Tau (HTTPS)',
      url: params.primaryHttpsUrl,
    });

    const banner = [
      header,
      indentBannerBlock(caQrAscii),
      caCaption,
      '',
      indentBannerBlock(httpsQrAscii),
      httpsCaption,
      steps,
    ].join('\n');

    writeStdoutLineByLineSync(`${banner}\n`);
  } catch (error) {
    // oxlint-disable-next-line no-console -- degraded boot UX
    console.error('[tau-serve] iOS CA QR banner omitted', error);
    emitTauServeCompanionPlainCaHints(params.baseHttpUrls);
  }
};

export type CreateAppOptions = {
  exposeDevHttpsCaAttachments?: boolean;
};

/** The SSR build produced by `react-router build`; absent until `nx build ui` has run. */
const serverBuildUrl = new URL('build/server/index.js', import.meta.url);

/**
 * Re-read the SSR build whenever a new one lands under a running serve.
 *
 * `react-router build` empties `build/` and rewrites it with fresh content
 * hashes, but `express.static` below reads `build/client` live from disk. A
 * serve that pinned the SSR module at boot therefore keeps emitting HTML that
 * points at chunk filenames the rebuild deleted: every route module 404s,
 * hydration never completes, and the page renders as an empty body with no
 * error anywhere. Anything that rebuilds `ui` while `nx serve ui` is up (a
 * manual `nx build ui`, an `ui-e2e` run, another target depending on
 * `ui:build`) triggers it.
 *
 * Keying on mtime costs one `stat` per request and re-imports only after a
 * build lands. Each re-import leaves the superseded module graph in the ESM
 * registry — a few MB per rebuild, bounded by how often a serve is rebuilt
 * under, and untouched by a normal single-build serve.
 */
export const loadServerBuild = (() => {
  let cached: { build: ServerBuild; mtimeMs: number } | undefined;

  return async (): Promise<ServerBuild> => {
    const { mtimeMs } = statSync(serverBuildUrl);
    if (cached?.mtimeMs !== mtimeMs) {
      // A build in flight can expose a half-written file; keep serving the last good one until it settles.
      try {
        // The build output is deliberately excluded from typecheck: it does not exist before `nx build ui`.
        cached = { build: (await import(`${serverBuildUrl.href}?mtime=${mtimeMs}`)) as ServerBuild, mtimeMs };
      } catch (error) {
        if (cached === undefined) {
          throw error;
        }
        // oxlint-disable-next-line no-console -- serve-time skew diagnostic
        console.warn('[tau-serve] Ignoring an unreadable SSR build; still serving the previous one.', error);
      }
    }

    return cached.build;
  };
})();

export async function createApp(options: CreateAppOptions = {}): Promise<Express> {
  // Load eagerly so a serve started without a build fails at boot rather than per request.
  await loadServerBuild();
  const app = express();
  app.disable('x-powered-by');
  app.use(coiMiddleware());
  app.use('/assets', express.static('build/client/assets', { immutable: true, maxAge: '1y' }));
  app.use(express.static('build/client', { maxAge: '1h' }));

  if (options.exposeDevHttpsCaAttachments === true) {
    app.get('/_dev/ca.crt', (_request, response) => {
      response.type('application/x-x509-ca-cert');
      response.setHeader('Content-Disposition', 'attachment; filename="taucad-dev-ca.crt"');
      response.sendFile(httpsCaPemPath);
    });
  }

  app.all('*splat', createRequestHandler({ build: loadServerBuild }));
  return app;
}

const serverFileDirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Self-bootstrap dev TLS materials so `nx serve ui --https` is the only
 * trigger for cert work. Called when `--https` is requested and the cert
 * files don't exist on disk; `bootstrap-https-certs.ts` is also exposed as
 * a standalone Nx target for explicit pre-warming.
 */
const ensureHttpsCertsBootstrapped = (): void => {
  if (existsSync(httpsCertPemPath) && existsSync(httpsKeyPemPath) && existsSync(httpsCaPemPath)) {
    return;
  }
  const bootstrapScript = path.resolve(serverFileDirname, 'scripts/bootstrap-https-certs.ts');

  /*
   * `bootstrap-https-certs.ts` is patched to omit mkcert's `-install` flag when
   * `MKCERT_TRUST_INSTALL=false` (see `patches/vite-plugin-mkcert@2.0.0.patch`)
   * so we never trip a `sudo` keychain prompt during a non-interactive serve.
   * Set/restore on `process.env` so the child inherits every existing variable
   * while this one scoped override is active.
   */
  const previousMkcertTrustInstall = process.env['MKCERT_TRUST_INSTALL'];
  process.env['MKCERT_TRUST_INSTALL'] = 'false';

  let result;
  try {
    result = spawnSync(process.execPath, ['--import', '@oxc-node/core/register', bootstrapScript], {
      cwd: serverFileDirname,
      stdio: 'inherit',
    });
  } finally {
    if (previousMkcertTrustInstall === undefined) {
      delete process.env['MKCERT_TRUST_INSTALL'];
    } else {
      process.env['MKCERT_TRUST_INSTALL'] = previousMkcertTrustInstall;
    }
  }

  if (result.status !== 0) {
    throw new Error(
      `[tau-serve] bootstrap-https-certs failed (exit ${result.status ?? `signal ${String(result.signal)}`}).`,
      { cause: result.error },
    );
  }
};

const readDevCaHttpPortDelta = (): number => {
  const raw = process.env['TAU_DEV_CA_HTTP_PORT_DELTA'];
  const parsed = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

/** Plain-HTTP responder for `_dev/ca.crt` so phones can fetch the mkcert root CA before trusting TLS. */
const sendDevTrustedCaAttachment = (response: ServerResponse): void => {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/x-x509-ca-cert');
  response.setHeader('Content-Disposition', 'attachment; filename="taucad-dev-ca.crt"');
  response.end(readFileSync(httpsCaPemPath));
};

// oxlint-disable-next-line @typescript-eslint/dot-notation -- noPropertyAccessFromIndexSignature requires bracket notation
if (process.env['NODE_ENV'] !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
  const httpsRequested = parseHttpsArgument(process.argv);
  const hostFromArgv = parseHostArgument(process.argv);
  const listenHost = hostFromArgv ?? '127.0.0.1';
  const scheme: 'http' | 'https' = httpsRequested ? 'https' : 'http';

  /** Mount `/_dev/ca.crt` whenever TLS is engaged (even under `NODE_ENV=production`) for handheld trust flows. */
  const exposeDevHttpsCaAttachments = httpsRequested;
  /** Offer a LAN-only plaintext CA fetch so iOS can install the mkcert CA without first trusting the server cert. */
  const attachCompanionPlainCaServer = httpsRequested && hostFromArgv !== undefined;

  const app = await createApp({ exposeDevHttpsCaAttachments });

  const emitTauServeBootLogs = async (): Promise<void> => {
    try {
      if (attachCompanionPlainCaServer) {
        const devCaListenPort = port + readDevCaHttpPortDelta();
        const baseHttpUrls = getServeNetworkUrls(devCaListenPort, hostFromArgv, 'http');
        const phoneCaUrls = baseHttpUrls
          .map((baseUrl) => `${baseUrl}/_dev/ca.crt`)
          .filter((caUrl) => isPhoneReachableLanCaUrl(caUrl));

        if (phoneCaUrls.length === 0) {
          emitTauServeCompanionPlainCaHints(baseHttpUrls);
        } else {
          const httpsUrls = getServeNetworkUrls(port, hostFromArgv, 'https');
          const primaryHttpsUrl = httpsUrls[0] ?? formatServeUrl('https', 'localhost', port);
          await emitIosTrustQrBannerOrCompanionHints({
            baseHttpUrls,
            extraLanCaUrls: phoneCaUrls.slice(1),
            extraLanHttpsUrls: httpsUrls.slice(1),
            primaryCaUrl: phoneCaUrls[0]!,
            primaryHttpsUrl,
          });
        }
      }

      // oxlint-disable-next-line no-console -- server boot log
      console.log(`[tau-serve] Local:   ${formatServeUrl(scheme, 'localhost', port)}`);
      for (const serveUrl of getServeNetworkUrls(port, hostFromArgv, scheme)) {
        // oxlint-disable-next-line no-console -- server boot log
        console.log(`[tau-serve] Network: ${serveUrl}`);
      }
    } catch (error) {
      // oxlint-disable-next-line no-console -- boot log catastrophic path
      console.error('[tau-serve] Failed to emit boot logs', error);
    }
  };

  const onListenLocal = (): void => {
    void emitTauServeBootLogs();
  };

  if (httpsRequested) {
    ensureHttpsCertsBootstrapped();

    /** Load mkcert artefacts produced by `bootstrap-https-certs.ts` / `vite-plugin-mkcert`. */
    let httpsCertContents: ReturnType<typeof readFileSync>;
    let httpsKeyContents: ReturnType<typeof readFileSync>;

    try {
      httpsCertContents = readFileSync(httpsCertPemPath);
      httpsKeyContents = readFileSync(httpsKeyPemPath);
    } catch (error) {
      throw new Error(
        `[tau-serve] Missing dev TLS files under ${path.dirname(httpsCertPemPath)}. ` +
          'Run `pnpm nx bootstrap-https-certs ui` (normally automatic when `--https` is passed).',
        { cause: error },
      );
    }

    createHttpsServer({ cert: httpsCertContents, key: httpsKeyContents }, app).listen(port, listenHost, onListenLocal);

    if (attachCompanionPlainCaServer) {
      const devCaListenPort = port + readDevCaHttpPortDelta();
      const companion = createHttpServer((request: IncomingMessage, response: ServerResponse) => {
        const urlPath = request.url ?? '/';
        /** Companion listens on `port + TAU_DEV_CA_HTTP_PORT_DELTA` (default **+1**) with plaintext HTTP only. */
        if (request.method?.toUpperCase() === 'GET' && urlPath.startsWith('/_dev/ca.crt')) {
          sendDevTrustedCaAttachment(response);
          return;
        }

        response.statusCode = 404;
        response.end();
      });

      companion.listen(devCaListenPort, listenHost);
    }
  } else {
    app.listen(port, listenHost, onListenLocal);
  }
}
