# @taucad/api-object-storage

API object storage: the S3 driver, signed file links and storage accounting.

The NestJS server library behind Tau's object store. `ObjectStorageService` is the root export; the global `StorageModule` is `./module`, the namespace prefixes and health probe key are `./constants`, signed file links are `./file-links`, and the hourly storage accounting module and scheduler are `./accounting` and `./accounting/scheduler`. `./testing/destructive-test-bucket-guard` is the guard every suite that writes or deletes in a bucket calls first.

Git builds on this library (its repository store adapts `ObjectStorageService`), so nothing here imports git: the per-repository byte ceiling that accounting reports against lives in `./repository-byte-ceiling`, and the API's git limits re-export it.

## Checks

- `pnpm nx test api-object-storage` runs the suites. `object-storage.service.test.ts` drives a real MinIO (`infra/docker-compose.yml`) with the `TAU_S3_*` settings from `apps/api/.env`; CI runs it in the `API tests (Postgres + MinIO)` job after the MinIO smoke.
