# @taucad/desktop-services-host

The desktop app's utility-process hosts: the services host (agent host, filesystem authority, machines, permissions, the shell and the Terminal concern's frames), the kernel and geometry hosts, native kernel preparation and the permission store. Private and source-consumed: `apps/desktop` bundles it, and its utility entries (`apps/desktop/src/utility/*.entry.ts`) start each host.

| Entry                                                      | What it holds                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `@taucad/desktop-services-host`                            | `createServicesHost` and the services host's frame and port types      |
| `@taucad/desktop-services-host/services-host`              | the services utility's bootstrap over `process.parentPort`             |
| `@taucad/desktop-services-host/kernel-host`                | the kernel utility's bootstrap                                         |
| `@taucad/desktop-services-host/geometry-host`              | the geometry utility's bootstrap                                       |
| `@taucad/desktop-services-host/geometry-host-impl`         | `createGeometryHost`                                                   |
| `@taucad/desktop-services-host/geometry-runner-client`     | `createGeometryRunnerClient`                                           |
| `@taucad/desktop-services-host/desktop-native-deployments` | the native kernel deployments, for main and the packaging scripts      |
| `@taucad/desktop-services-host/native-preparation`         | `createDesktopKernelPreparer`, main's first-use preparer               |
| `@taucad/desktop-services-host/native-store`               | `startNativeStore` and `desktopNativeKernelIds`                        |
| `@taucad/desktop-services-host/project-roots`              | the project root registry and `canonicalPath`, which main imports back |
| `@taucad/desktop-services-host/diagnostics`                | the diagnostics port: `provideDiagnosticsLog` and `openDiagnosticsLog` |

The desktop Terminal's real rows (`desktop-services-host:test:terminal-conformance`, A09, A11, A14, A24) drive the Terminal through the real services host, its root allowlist frame and its `terminal` concern frame. The project is tagged `ci:shell`, so the merge queue's shell lane runs them on MAC-A, MAC-X and the Linux guests when a change affects it.
