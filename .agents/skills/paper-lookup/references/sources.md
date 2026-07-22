# Paper source contract

Use only these anonymous metadata services through the available structured web tooling.

## arXiv

- Host: `export.arxiv.org`
- Endpoint: `https://export.arxiv.org/api/query`
- One request page, `max_results=10`.
- Topic searches use an encoded `search_query`; identifier lookups accept only canonical modern IDs (`YYMM.NNNNN`) or legacy category IDs.
- Record title, authors, published/updated dates, abstract bounded to 2,000 scalars, canonical abstract URL, canonical PDF proposal, arXiv ID without a version suffix, reported license if present, query, and access time.
- Do not infer permission from arXiv hosting. Only an approved machine-readable license can become `rights.status: permitted` later.

## Crossref

- Host: `api.crossref.org`
- Endpoint: `https://api.crossref.org/works`
- Use `query.bibliographic` for topic/title discovery or a URL-encoded DOI path for exact lookup; set `rows=10` and request one page.
- Record DOI lowercased without a resolver prefix, title, authors, issued year, venue, bounded abstract when present, canonical DOI URL, query, and access time.
- Do not submit an email address and do not treat a publisher link as an artifact permission grant.

## Identifier validation

- DOI: remove a leading `https://doi.org/`, trim, lowercase, then require a `10.` registrant prefix and a non-empty suffix without whitespace.
- arXiv: remove a leading `arXiv:`, trim, remove a terminal `v` plus digits, and reject whitespace or URL fragments.
- Never place metadata values in a command, local path, header, or arbitrary follow-up endpoint.
