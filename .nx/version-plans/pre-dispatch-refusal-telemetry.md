---
host: minor
cli: minor
---

Pre-dispatch refusals reach runtime telemetry (T19). `@taucad/host/telemetry` adds `preparationReporter`, `reportingPrepareKernel`, `failedPreparation` and `admissionRefusalReporter` (with the `PreparationReport` and `PreparationStateInput` types), and `openSharedMachineHost` takes `onAdmissionRefusal` (new type `AdmissionRefusalReport`), so a host records one `prepare` entry per settled preparation and one `admit` entry per refused machines request, with closed codes only and under the host's existing consent. `tau prepare`, `tau mcp`'s `prepare_kernel`, the Tau UI layer and `prepare_kernel` on a provisioned cloud host (`tau serve` with `TAU_CLOUD_HOST=1`), and `tau mcp --machines` admission now report through the process's own composition; nothing is sent when telemetry is off, and what a command answers or exits with is unchanged.
