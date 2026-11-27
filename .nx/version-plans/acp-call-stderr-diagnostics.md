---
host: patch
---

An external agent's failed call keeps the stderr lines it wrote just before it answered. An agent writes why it failed to stderr and then answers on stdout. The two are separate pipes, so the failure could be read before the stderr bytes, and then it carried no diagnostics. The connection now reads stderr for two turns of the event loop before it reports the failure.
