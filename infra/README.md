# Local infrastructure

`pnpm infra:up` starts Tau's default PostgreSQL, Redis, object storage, and observability services.

Durable jobs use the opt-in, source-qualified Hatchet profile:

```bash
docker-compose -f infra/docker-compose.yml --profile jobs up -d hatchet
export HATCHET_CLIENT_TOKEN="$(docker-compose -f infra/docker-compose.yml exec -T hatchet cat /config/authdisabled-token)"
export HATCHET_CLIENT_HOST_PORT=localhost:7070
export HATCHET_CLIENT_API_URL=http://localhost:8888
export HATCHET_CLIENT_TLS_STRATEGY=none
export HATCHET_CLIENT_NAMESPACE=tau-local
```

The local image is Hatchet's authentication-disabled development build. Production must use an authenticated Hatchet deployment and a separately issued client token.
