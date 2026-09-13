# @taucad/jobs-solvers

Daemon-hosted OpenFOAM and CalculiX providers for `@taucad/jobs`. Browser clients
submit immutable, JSON-safe definitions from the browser-safe
`@taucad/jobs-solvers/definitions` entry point; only trusted native hosts resolve snapshots,
create attempt workspaces, and assemble explicit process argument vectors.

OpenFOAM defaults to the immutable OpenCFD `opencfd/openfoam-default:2506` image
index digest. Release `2606` is supported only when a definition explicitly selects
it and the daemon configures a reviewed 2606 image; there is no silent fallback. The
OpenFOAM provider exposes fixed pipelines rather than arbitrary commands.

Each successful OpenFOAM stage is a deterministic compute boundary. Its action identity includes
the prior workspace snapshot, prior stage action, declared input, pinned image digest, command,
normalized arguments, solver release, ranks, host platform, and the complete container execution
policy. The stage workspace is serialized deterministically and published as content before its
action record. A retry restores the longest valid prefix; changed late-stage inputs invalidate
only that stage and its descendants. Failed, cancelled, and interrupted stages publish no action
record, so their partial work cannot become a resume point. Warm and cold attempts produce the
same terminal artifact bytes.

CalculiX jobs author coarse and refined C3D8 cantilever decks, validate support
reaction and analytical displacement, and persist `.inp`, `.dat`, `.frd`, logs,
JSON summary, and Markdown report artifacts. A reviewed runnable CalculiX 2.23
image is required from the deployment. The widely available `calculix/ccx:latest`
image is 2.16 and must not be used as 2.23 provenance. Until a reviewed FRD-to-GLB
converter is configured, the provider returns a typed conversion-unavailable
artifact instead of fabricating geometry.

Run the fake-executor conformance suite without Docker:

```sh
pnpm nx test jobs-solvers --watch=false
```

Run image probes when Docker is available. `TAU_CALCULIX_IMAGE` must name the
deployment-reviewed CalculiX 2.23 image:

```sh
TAU_CALCULIX_IMAGE=registry.example/calculix@sha256:... \
  pnpm --dir packages/jobs-solvers test:docker-integration
```
