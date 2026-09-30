---
title: 'Port Allocation Policy'
description: 'Canonical port assignments for all Tau services across dev, test, production, and infrastructure contexts to prevent collisions and browser-unsafe port errors.'
status: active
created: '2026-03-18'
updated: '2026-09-30'
related:
  - docs/research/observability-architecture.md
---

# Port Allocation Policy

Internal reference for port assignments across all Tau services and environments.

## Rationale

Tau runs multiple services concurrently in development: a UI dev server, an API server, a WebSocket dev server, databases, and an observability stack. Without a canonical registry, port collisions cause silent failures, browser `ERR_UNSAFE_PORT` errors, and wasted debugging time. This policy is the single source of truth.

## Rules

### 1. Follow the Canonical Port Map

All port assignments must match the table below. Never introduce a new port without adding it here first.

| Port  | Service                           | Context  | Configured In                                                      |
| ----- | --------------------------------- | -------- | ------------------------------------------------------------------ |
| 443   | Portless HTTPS localhost proxy    | Dev      | Portless default; interactive privileged startup                   |
| 1355  | Portless unprivileged HTTPS proxy | Dev      | `pnpm exec portless proxy start --port 1355 --https`               |
| 3000  | UI Vite dev server                | Dev      | `apps/ui/vite.config.ts`                                           |
| 3000  | API (Fly.io internal)             | Prod     | `apps/api/fly.prod.toml`, `apps/api/fly.staging.toml`              |
| 3000  | API (test env)                    | Test     | `apps/api/.env.test`                                               |
| 4000  | API (NestJS dev server)           | Dev      | `apps/api/.env`                                                    |
| 4001  | Dev WebSocket server (Socket.IO)  | Dev      | `apps/api/app/api/websocket/dev-websocket.service.ts` (`PORT + 1`) |
| 4317  | OTLP gRPC receiver                | Infra    | `infra/docker-compose.yml`                                         |
| 4318  | OTLP HTTP receiver                | Infra    | `infra/docker-compose.yml`                                         |
| 5432  | PostgreSQL                        | Infra    | `infra/docker-compose.yml`                                         |
| 6100  | Grafana UI (otel-lgtm)            | Infra    | `infra/docker-compose.yml`                                         |
| 6379  | Redis                             | Infra    | `infra/docker-compose.yml`                                         |
| 9090  | Prometheus                        | Infra    | `infra/docker-compose.yml`                                         |
| 9464  | OTEL Prometheus metrics exporter  | Dev/Prod | `apps/api/app/telemetry/otel.ts`, `apps/api/fly.prod.toml`         |
| 11434 | Ollama (local LLM)                | Dev      | `apps/api/app/api/providers/provider.service.ts`                   |
| 42114 | SearXNG search                    | Infra    | `infra/search/docker-compose.yml`                                  |

Named localhost previews share the Portless proxy. Their backend ports are allocated by
Portless from 4000–4999 and passed through `PORT`; do not reserve a fixed port per guide.
Port 1355 is Portless's unprivileged alternative when an interactive port-443 startup is unavailable.

**Internal-only ports** (inside Docker containers, not exposed to host):

| Port | Service | Container |
| ---- | ------- | --------- |
| 3100 | Loki    | otel-lgtm |
| 3200 | Tempo   | otel-lgtm |

### 2. Never Use Browser-Unsafe Ports

Chromium, Firefox, and Safari block HTTP requests to certain ports with `ERR_UNSAFE_PORT`. Never expose a browser-accessible service on any of these ports.

**Why**: Browser-blocked ports cause a hard failure — users cannot access the service at all, with no workaround except changing the port.

**Blocked ports** (Chromium/Chrome full list):

| Blocked | Service association  | Blocked   | Service association |
| ------- | -------------------- | --------- | ------------------- |
| 1       | tcpmux               | 540       | uucp                |
| 7       | echo                 | 548       | AFP                 |
| 9       | discard              | 554       | RTSP                |
| 11      | systat               | 556       | remotefs            |
| 13      | daytime              | 563       | NNTPS               |
| 15      | netstat              | 587       | SMTP submission     |
| 17      | qotd                 | 601       | syslog-conn         |
| 19      | chargen              | 636       | LDAPS               |
| 20–21   | FTP                  | 989–990   | FTPS                |
| 22      | SSH                  | 993       | IMAPS               |
| 23      | Telnet               | 995       | POP3S               |
| 25      | SMTP                 | 1719–1720 | H.323               |
| 37      | time                 | 1723      | PPTP                |
| 42      | nameserver           | 2049      | NFS                 |
| 43      | whois                | 3659      | apple-sasl          |
| 53      | DNS                  | 4045      | NFS lock            |
| 69      | TFTP                 | 5060–5061 | SIP                 |
| 77      | rje                  | **6000**  | **X11**             |
| 79      | finger               | 6566      | sane-port           |
| 87      | link                 | 6665–6669 | IRC                 |
| 95      | supdup               | 6697      | IRC+TLS             |
| 101–104 | various              | 10080     | Amanda              |
| 109–110 | POP2/POP3            |           |                     |
| 111     | Sun RPC              |           |                     |
| 113     | ident                |           |                     |
| 115     | SFTP                 |           |                     |
| 117     | uucp-path            |           |                     |
| 119     | NNTP                 |           |                     |
| 123     | NTP                  |           |                     |
| 135     | MSRPC                |           |                     |
| 137–139 | NetBIOS              |           |                     |
| 143     | IMAP                 |           |                     |
| 161     | SNMP                 |           |                     |
| 179     | BGP                  |           |                     |
| 389     | LDAP                 |           |                     |
| 427     | SLP                  |           |                     |
| 465     | SMTPS                |           |                     |
| 512–515 | rexec/rlogin/rsh/lpd |           |                     |
| 526–532 | various              |           |                     |

### 3. Derive the WebSocket Port, Never Hardcode It

The dev WebSocket server port is always `API_PORT + 1`. Do not hardcode a separate port constant.

**Why**: A single `PORT` env var controls both the API and WebSocket dev server, keeping them coupled and collision-free.

CORRECT:

```typescript
const wsPort = mainPort + 1;
```

INCORRECT:

```typescript
const wsPort = 4001; // hardcoded
```

### 4. Use Ephemeral Ports in Tests

Test servers must listen on port `0` to let the OS assign an available port. Never bind to a fixed port in test code.

**Why**: Fixed ports cause flaky parallel test runs and CI failures.

CORRECT:

```typescript
const server = app.listen(0);
const port = (server.address() as AddressInfo).port;
```

INCORRECT:

```typescript
const server = app.listen(3000);
```

### 5. Port 3000 Is Shared Across Contexts — Never Run Conflicting Contexts Simultaneously

Port 3000 is used by the UI dev server, the API in test mode, and the API in production. These contexts are mutually exclusive by design:

| Context    | Port 3000 owner |
| ---------- | --------------- |
| Dev        | UI Vite server  |
| Test       | API test server |
| Production | API (Fly.io)    |

Do not attempt to run the UI dev server and the API test suite at the same time without overriding one port.

### 6. Reserve Port Ranges by Domain

When adding new services, allocate from the appropriate range:

| Range       | Domain                                                |
| ----------- | ----------------------------------------------------- |
| 3000–3999   | Application servers                                   |
| 4000–4999   | API, WebSocket, OTLP                                  |
| 5000–5999   | Reserved (avoid — macOS AirPlay, common OS conflicts) |
| 6000–6099   | Reserved (avoid — X11, browser-blocked)               |
| 6100–6999   | Observability, Redis                                  |
| 9000–9999   | Metrics exporters                                     |
| 10000–19999 | External tool defaults (Ollama, etc.)                 |
| 40000–49999 | Auxiliary infra                                       |

**Why**: Predictable ranges make it easy to reason about firewall rules, Docker port mappings, and collision risk. The 5000s and 6000–6099 range are explicitly reserved to avoid OS and browser conflicts.

### 7. Configure Ports via Environment Variables

All application ports must be configurable via environment variables with sensible defaults. Never hardcode a port in application bootstrap code without an env var fallback.

**Why**: Deployment platforms (Fly.io, Docker, CI) need to override ports without code changes.

CORRECT:

```typescript
const port = process.env['PORT'] ?? '3000';
```

INCORRECT:

```typescript
const port = 3000;
```

### 8. Update This Policy When Adding a Port

Any PR that introduces a new port binding must update the canonical port map in Rule 1. Reviewers should verify the map is current.

## Anti-Patterns

- **Using browser-unsafe ports (6000, 6666, 10080, etc.)**: Browsers silently block HTTP to these ports with `ERR_UNSAFE_PORT`. There is no server-side workaround — users must launch Chrome with `--explicitly-allowed-ports` or the service is simply inaccessible. Always cross-check Rule 2 before picking a port for any browser-facing service.
- **Using port 5000**: macOS AirPlay Receiver binds to 5000/5001 by default. Avoid the entire 5000–5999 range.
- **Picking "random" high ports**: Use the range table in Rule 6. Ad-hoc ports like 8080 or 8888 are common defaults for other tools and will collide.
- **Port-per-feature in dev**: The API serves REST, WebSocket (prod via Redis adapter), and metrics on separate ports. Do not add more ports unless the protocol genuinely requires a separate listener.

## Summary Checklist

- [ ] New port added to the canonical port map (Rule 1)
- [ ] Port is not in the browser-unsafe list (Rule 2)
- [ ] Port configured via env var with default (Rule 7)
- [ ] Tests use port 0 (Rule 4)
- [ ] Port falls within the correct domain range (Rule 6)
- [ ] No collision with existing assignments
- [ ] This policy updated in the same PR

## References

- [Chromium blocked ports source](https://chromium.googlesource.com/chromium/src/+/master/net/base/port_util.cc)
- Related: `docs/research/observability-architecture.md`
- Related: `docs/policy/rpc-policy.md`
