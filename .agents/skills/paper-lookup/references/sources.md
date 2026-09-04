# Paper source contract

Prefer these anonymous metadata services through structured web tooling when the tool supports their response format. Use the fallback below when a service request fails or cannot be opened; do not replace the tool with an ad hoc network script.

## arXiv

- Host: `export.arxiv.org`
- Endpoint: `https://export.arxiv.org/api/query`
- One request page, `max_results=10`.
- Topic searches use an encoded `search_query`; identifier lookups accept only canonical modern IDs (`YYMM.NNNNN`) or legacy category IDs.
- Record title, authors, published/updated dates, abstract bounded to 2,000 scalars, canonical abstract URL, canonical PDF proposal, arXiv ID without a version suffix, reported license if present, query, and access time.
- Do not infer permission from arXiv hosting. Pass reported license evidence or explicit user authorization to Create Reference's rights gate; do not assign permission merely because a PDF is public.

## Crossref

- Host: `api.crossref.org`
- Endpoint: `https://api.crossref.org/works`
- Use `query.bibliographic` for topic/title discovery or a URL-encoded DOI path for exact lookup; set `rows=10` and request one page.
- Record DOI lowercased without a resolver prefix, title, authors, issued year, venue, bounded abstract when present, canonical DOI URL, query, and access time.
- Do not submit an email address and do not treat a publisher link as an artifact permission grant.

## Structured-search fallback

- Use the available structured search tool with the subject or a known title as query data. Prefer `arxiv.org` abstract pages, then the original publisher or an author-institution publication page for exact metadata verification.
- Open the primary result to verify title, authors, year, DOI/arXiv identity, and an artifact proposal. A search snippet can nominate a candidate but cannot establish full-paper findings or a license.
- Keep the same four-query, ten-candidate total budget across API attempts and fallback; one page per query, no pagination. Exact primary-page verification is bounded by the composing Find Research workflow.
- Record which transport failed and which primary page supplied the recovered metadata. Keep the collector as `paper-lookup`; changing transport is not an independent source or a reason to count the same paper twice.
- If neither metadata nor primary-page verification works, return the partial result and precise gap. Do not seek credentials, use an unofficial mirror, or download artifacts during discovery.

## Identifier validation

- DOI: remove a leading `https://doi.org/`, trim, lowercase, then require a `10.` registrant prefix and a non-empty suffix without whitespace.
- arXiv: remove a leading `arXiv:`, trim, remove a terminal `v` plus digits, and reject whitespace or URL fragments.
- Never place metadata values in a command, local path, header, or arbitrary follow-up endpoint.
