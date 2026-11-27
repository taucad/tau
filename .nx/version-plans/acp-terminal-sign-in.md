---
host: minor
---

An external agent can be signed in from Tau Desktop's own Terminal. Every reviewed profile now declares `loginArgs`, the words of its `loginCommand` after its CLI, and `ReviewedAcpAgentProfile` requires them at compile time; the conformance suite checks that `[cli, ...loginArgs]` spells `loginCommand`, so a new profile gets the sign-in tab with no other code. The new `acpLoginLaunch(adapter, options?)` answers a structured launch for that sign-in: the CLI located again (refusing `CLI_NOT_FOUND` when it has gone), the profile's `loginArgs`, the environment the adapter itself gets from `acpAdapterEnvironment` (its `configEnv` included, `ELECTRON_RUN_AS_NODE` removed) plus `DISPLAY`, `WAYLAND_DISPLAY` and `DBUS_SESSION_BUS_ADDRESS` so the CLI can open the default browser, and the `commandLine` to show before it runs: the login card's own command, bare for a CLI on `PATH` and the quoted absolute path for one found outside it. It never builds or runs a shell line.
