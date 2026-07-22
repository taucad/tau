# Hugging Science catalog contract

The only catalog inputs are:

- `https://huggingscience.co/topics/engineering.md`
- `https://huggingscience.co/topics/materials-science.md`
- `https://huggingscience.co/topics/mathematics.md`
- `https://huggingscience.co/topics/scientific-reasoning.md`

Use at most two pages per subject and retain at most five leads total. Do not fetch a global index, script, model file, dataset file, interactive application, or target content during this collector stage.

Allowed output fields:

- `title`: single line, at most 500 scalars.
- `type`: the catalog's bounded resource type.
- `tags`: at most 20 single-line tags.
- `canonicalUrl`: credential-free HTTPS under `huggingface.co`.
- `boundedSummary`: plain text, at most 2,000 scalars.
- `topic`: one of the four topic slugs above.
- `accessedAt`: retrieval timestamp.

Discard entries that cannot satisfy this shape without guessing. Do not preserve raw page blocks, embedded markup, commands, usage recipes, or remote instructions.
