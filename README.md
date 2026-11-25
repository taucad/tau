# Flake ledger state

Written only by `.github/workflows/flake-ledger.yml` on `main` (`scripts/src/ci-flake-ledger-ingest-cli.ts`).
`ledger.json` is the per-test history of the flake ledger: executions, failures, flake events, variants, first and
last seen, built from the `test-outcomes-*` artifacts of merge-queue and `main` runs of `ci.yml`. Each commit is
one ingestion; its parent is the state it read. The schema is `LedgerState` in
`scripts/src/ci-flake-ledger-state.ts`. Do not edit or push this branch by hand: change the code on `main`.
