# Web UI

This app owns the browser shell, editor, file manager, chat presentation, and browser composition of the portable CAD-agent host.

## Local Rules

- Build CAD turns with `useCadAgentConfig` and `useCadChatClient`. Use the shared `BrowserPlacementChatTransport`; API `DefaultChatTransport` clients are reserved for project-name and commit-name profiles.
- Keep admission and execution placement in the durable turn body assembled by `setLatestAgentBody`. Request factories must remain valid after the initiating component unmounts.
- Treat the portable host event log as authoritative when attaching or reattaching. Rebuild the UI transcript from the whole log; do not append a second competing history.
- Close project-scoped workers, services, and subscriptions when project identity changes. Route editor, file, and revision transitions through their owning XState machines and filesystem authorities.
- Finalize only interrupted tail tool parts, using the RPC ledger before assigning an interruption result. Follow [Interrupted Tool-Call Contract Policy](../../docs/policy/interrupted-tool-call-contract.md).
- Keep the streaming activity skeleton inside the single `TurnGroup` that owns the run. Use `Chat.startupRequest` for startup messages and `commitCancelledDraftRestore` for durable cancelled-draft restoration.
- Activate Monaco/Shiki language features on demand. Follow [Language Contribution Policy](../../docs/policy/language-contribution-policy.md) and [Filesystem Policy](../../docs/policy/filesystem-policy.md).
- Follow [Chat Request Config Policy](../../docs/policy/chat-request-config-policy.md), [XState Policy](../../docs/policy/xstate-policy.md), [SSR Bundle Policy](../../docs/policy/ssr-bundle-policy.md), and [React Testing Policy](../../docs/policy/react-testing-policy.md).

## Checks

Use `pnpm nx lint ui`, `pnpm nx test ui --watch=false`, `pnpm nx typecheck ui`, and `pnpm nx build ui` as appropriate. Verify visible interaction changes in a real browser.

Quote focused test paths containing `$` so the shell preserves route parameters.

## Interaction and serving contracts

- Reuse existing UI owners and name them in the change. Copy/Copy-Link controls use `app/components/copy-button.tsx` and its success tick. Sharing/publication controls remain usable before render success so broken projects can be shared for diagnosis.
- Activity wrappers follow the stable first aggregatable group, never a changing group count. Keep an established wrapper mounted until a non-foldable category ends its run. `ActivityFoldContext.disableInnerFold` suppresses nested chrome without losing toggle/animation state.
- File loading uses the filesystem owner's typed text/binary/too-large/orphaned/error outcomes. The canonical content classifier reads a 512-byte prefix with BOM/NUL handling; an extension must not decide whether the editor leaves its loading state.
- Keep `app/routes.ts` minimal and route modules under `app/routes`. Build-time Netlify values and SSR runtime values have different lifetimes; `app/environment.config.ts` owns runtime resolution. Keep the server's `tslib` runtime dependency and defer expensive analytics initialization and grammar loading.
- For serving/deployment, read [infrastructure instructions](../../infra/AGENTS.md). `server.ts` and `app/lib/server-args.ts` own explicit host/HTTPS options and cross-origin headers. Preserve the LAN CA-trust explanation and CA/page QR targets when host and HTTPS are enabled; never install trust certificates implicitly.
- Derive selector trigger labels from the same selected-state authority as their menus. Theme labels use the durable preference that also drives SSR and rendering; do not create a second display-only source.
- Keep the `/` server render session-neutral. Resolve home-route authentication client-side from the shared session rather than a separate first-paint hint.
- Keep Better Auth multi-session disabled; do not wire its plugins, endpoints, or UI.
- Global React Query side effects consume the root shared `QueryClient`; do not create a second client.
