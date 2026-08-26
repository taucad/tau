import type { Configuration } from '@taucad/kcl-wasm-lib/bindings/Configuration';
import type { PartialDeep } from 'type-fest';
import deepmerge from 'deepmerge';

/**
 * Default `Context.execute` / `executeMock` / `bustCacheAndResetScene` settings JSON for Tau: the runtime uses the Zoo
 * engine as a headless geometry server (GLB export, local three.js viewer). Tau never opens the WebRTC video stream
 * that modeling-app consumes, so server-side post-processing state (SSAO + order-independent transparency toggles) is not
 * initialised the way the interactive host primes it.
 *
 * @remarks Per-field engine wiring and why each default is headless-safe: **Finding 13** in
 * `docs/research/zoo-kcl-std-prelude-load-failure.md`.
 *
 * @see docs/research/zoo-kcl-std-prelude-load-failure.md — Findings 11–13.
 * @see repos/zoo-modeling-app/rust/kcl-lib/src/execution/mod.rs — `ExecutorContext::send_clear_scene` gates
 *   `SetOrderIndependentTransparency` on `settings.enable_ssao`.
 */
export const tauHeadlessKclSettings: PartialDeep<Configuration> = {
  settings: {
    modeling: {
      /**
       * Must be `false` for Tau's WebSocket-only bridge: empty `"{}"` deserialises to upstream defaults where
       * `Option<DefaultTrue>::unwrap_or_default()` yields SSAO “on”, which queues `set_order_independent_transparency`.
       * The headless engine rejects that command with `{ success: false, errors: [] }`; the resulting empty
       * `KclError` message surfaces as the `std::types` / `std::prelude` semantic wrap (`inner_msg=""`).
       */
      // eslint-disable-next-line @typescript-eslint/naming-convention -- wire field: serde `rename_all = "snake_case"` on `Configuration`
      enable_ssao: false,

      /**
       * Disables the engine's `EdgeLinesVisible(hidden=true)` wireframe overlay (`reapply_settings` →
       * `EngineManager::set_edge_visibility`, `repos/zoo-modeling-app/rust/kcl-lib/src/engine/mod.rs` ~331–357). Tau
       * never displays the engine's streamed video; GLB edges come from modeling ops, not this viewport toggle.
       */
      // eslint-disable-next-line @typescript-eslint/naming-convention -- wire field (serde snake_case)
      highlight_edges: false,

      /**
       * Hides the engine scale grid (`modify_grid` → `ObjectVisible` on grid + scale-text object IDs,
       * `engine/mod.rs` ~790–829). Tau draws its own grid in three.js. Maps to `ExecutorSettings.show_grid` from
       * `show_scale_grid` in JSON (`execution/mod.rs` ~805–815).
       */
      // eslint-disable-next-line @typescript-eslint/naming-convention -- wire field (serde snake_case)
      show_scale_grid: false,

      /**
       * Uses `GridScaleBehavior::ScaleWithZoom` / `SetGridAutoScale` instead of `Fixed` + `SetGridScale`
       * (`engine/mod.rs` ~939–946, `run_with_caching` / `reapply_settings` in `execution/mod.rs`). The grid is hidden;
       * auto-scale avoids fixed-unit grid commands when the overlay is off.
       */
      // eslint-disable-next-line @typescript-eslint/naming-convention -- wire field (serde snake_case)
      fixed_size_grid: false,
    },
  },
};

/**
 * Serialises KCL WASM configuration with Tau headless defaults applied first; caller `overrides` win on conflict
 * (e.g. a future WebRTC consumer may pass `enable_ssao: true` after priming the stream).
 *
 * @param overrides - optional partial {@link Configuration} merged on top of {@link tauHeadlessKclSettings}
 * @returns JSON string accepted by WASM `create_executor_ctx` (`serde_json::from_str` into `kcl_lib::Configuration`).
 */
export function buildKclSettingsJson(overrides?: PartialDeep<Configuration>): string {
  return JSON.stringify(deepmerge(tauHeadlessKclSettings, overrides ?? {}));
}
