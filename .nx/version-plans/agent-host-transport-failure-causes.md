---
agent-host: patch
---

A model transport failure now records the errors beneath it. The `tau.model-transport-failure` diagnostic carries `details.causes`, the chain under the coded error (outermost first, at most four, with an aggregate's members), each by `name`, `code` and `syscall`. Messages are left out because they can name local paths. A `NETWORK_ERROR` can now be told apart as a refused connection, a socket the OS would not open, or a request rejected before it was sent.
