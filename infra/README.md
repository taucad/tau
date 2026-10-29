# Local infrastructure

`pnpm infra:up` starts Tau's default PostgreSQL, Redis, object storage, and observability services.

Published host ports bind to `127.0.0.1`. Other machines on the network cannot reach them. Containers on the Compose network still reach each other by service name.
