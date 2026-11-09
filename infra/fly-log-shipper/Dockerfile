# Fly's log shipper with Tau's Loki sink (W8): the stock image, pinned by
# digest, plus one file that replaces its Loki sink to add a `service_name`
# label. Bump the digest only after reading the upstream changelog and diffing
# its /etc/vector/sinks/loki.toml against vector-configs/sinks/loki.toml.
FROM flyio/log-shipper:v0.0.8@sha256:72c7ff62b6871b86968650a67cec99d2b438b157b1da8f5bb365a8184dcaeeec

COPY vector-configs/sinks/loki.toml /etc/vector/sinks/loki.toml
