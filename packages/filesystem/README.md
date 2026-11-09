# @taucad/filesystem

Filesystem abstraction layer with watch-based reactivity for Tau (core / worker-facing; UI client facades live in `@taucad/fs-client`).

`@taucad/filesystem` publishes separately in the fixed `@taucad/*` release train ([release policy](https://github.com/taucad/tau/blob/main/docs/policy/release-policy.md)). It is not bundled: `@taucad/runtime`, `@taucad/agent-host`, `@taucad/revisions`, `@taucad/bundler-core`, `@taucad/host` and `@taucad/cli` depend on it as an external runtime dependency, so installing any of them installs it. Depend on it directly when you compose a filesystem yourself.

```sh
pnpm add @taucad/filesystem
```
