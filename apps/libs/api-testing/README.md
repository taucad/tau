# @taucad/api-testing

Shared API test fixtures that need only the database.

Fixtures here may depend on `api-database` and `api-core` and nothing above them, so any API library's tests can import them without gaining a feature library in their dependency closure. A fixture that builds on a feature library ships in that library's own `./testing/*` subpath (`@taucad/api-billing/testing/*`, `@taucad/api-database/testing/*`).

- `createDeletionDatabase`, `seedDeletionProject` and `assertDeletionDatabase`: the project-deletion acceptance database, which refuses anything but its own loopback PostgreSQL container.
