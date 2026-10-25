---
runtime: patch
---

A document no longer keeps its own copy of a view's mesh once the compute cache holds it. In Memory and Durable modes the worker drops a view's projection after the render was served from the cache, or once its background publication stores, so a large model is retained once instead of twice. A second view of the same options is then served from the compute cache. Off mode, and renders whose publication is refused, keep the projection as before.
