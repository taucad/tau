/**
 * The shell supervisor entry (`dist/shell/srt-supervisor.mjs`). The supervisor lives in `@taucad/sandbox`, which this
 * package bundles; importing it for its side effect emits the bundled mirror at `dist/libs/sandbox/src/shell/`, beside
 * the provider whose default supervisor resolves `./srt-supervisor.mjs` from its own module.
 */
import '@taucad/sandbox/shell/srt-supervisor'; // oxlint-disable-line import/no-unassigned-import -- the supervisor runs on import
