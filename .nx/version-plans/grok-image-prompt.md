---
host: patch
---

An image attached to a Grok chat turn is sent to Grok. The CLI accepts image prompt blocks and reads them with a vision-capable model, even though its handshake does not advertise image input. Agents that cannot read images, and Grok audio, are still refused before the turn is sent.
