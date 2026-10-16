# @taucad/consent

The optional-analytics decision shared by the Tau app (`apps/ui`) and the website (`apps/www`).

Both are served on one hostname, so the host-only `tau-cookie-consent` cookie (`{"status":"accepted"|"declined","version":1}`, `Path=/`, `SameSite=Lax`, 365 days) records one decision for both. Either surface can show the choice — the website's consent panel and the app's **Help → Cookie preferences** dialog — and `writeConsent` announces each change on the `tau-cookie-consent` broadcast channel so open documents re-read the cookie.

- `readConsentCookie` / `parseConsent`: read a `Cookie` header or `document.cookie`, honouring pre-versioned values.
- `serializeConsentCookie` / `writeConsent`: record or withdraw a decision.

Privacy signals (Global Privacy Control, Do Not Track) and analytics transports stay with each consumer, which applies them before reading or writing.
