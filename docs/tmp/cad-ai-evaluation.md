# CAD-AI Evaluation & Prompt Engineering Standards

## 1  Bench Metrics (MVP)

| Category | Metric | Target |
|---|---|---|
| Geometry | Kernel success rate | ≥ 99 % successful boolean / tessellation |
| Geometry | Manifold solid | `ShapeMesh.triangles.length > 0` & Euler check |
| Intent match | Parametric robustness | ≥ 90 % of params can be ±5 % without failure |
| Intent match | Visual similarity (SSIM/CLIP) | ≥ 0.85 vs reference render |
| Code quality | Clone ratio | ≤ 15 % duplicate lines |
| Code quality | RMS layer order | 100 % (static rule-checker) |
| Efficiency | Prompt tokens / turn (p95) | ≤ 2 000 |

> **Note:** "Kernel success" is measured by running the generated JS under Replicad/OpenCascade headless; failures throw.

## 2  Replicad API → LLM Format

1. Start from `gen/api/replicad/replicad-clean-with-jsdoc.d.ts`.
2. Strip compiler-only noise with regex:  
   ```ts
   /^.*\b(gp_|TopoDS_|BRep|Adaptor3d_|Handle_|Bnd_).*$/gm
   ```
3. Remove generics, `private|protected`, overload duplicates (keep max-arity).
4. Save each top-level `export` with its JSDoc into JSON chunks:
   ```jsonc
   {
     "id": "drawRoundedRectangle",
     "signature": "export declare function drawRoundedRectangle(width: number, height: number, r?: number | { rx?: number; ry?: number; }): Drawing;",
     "jsDoc": "Creates the Drawing of a rectangle with rounded corners…"
   }
   ```
5. Persist array to `gen/api/replicad/replicad-chunks.json` (≈ 900 objects).

## 3  Vector Store (RAG)

* DB: **PostgreSQL 15** + `pgvector` extension  
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```
* Table schema
  ```sql
  CREATE TABLE replicad_chunks (
    id text PRIMARY KEY,
    signature text,
    jsdoc text,
    embedding vector(1536)
  );
  ```
* CLI build script (`scripts/build-replicad-chunks.ts`) inserts with `INSERT … ON CONFLICT`.
* Runtime retrieval (in `chat-prompt-replicad.ts`):
  ```ts
  const top = await db
    .select()
    .from('replicad_chunks')
    .orderBy(sql`embedding <-> $1`, [queryEmbedding])
    .limit(8);
  ```

## 4  Prompt-side Memory Strategy

* **Vector memory**: store `(summary, embedding)` for every completed assistant/cad message.
* **Sliding window**: keep last 4 messages verbatim.
* **Image captions**: base64 never sent; use CLIP caption + embedding.
* **Tool call summaries**: 1-sentence description replaces raw JSON.

## 5  Package Setup

```bash
pnpm install pg pgvector           # DB client + vector helpers
```

The server must enable the `pgvector` extension once per database.

---
These standards are the source-of-truth for future eval harnesses and prompt refactors. 
