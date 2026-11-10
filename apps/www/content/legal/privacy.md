# Privacy Policy

*Effective date: November 9, 2026*

This policy explains what TAUCAD LIMITED ("Tau", "we", "us") collects when you use tau.new, the Tau web and desktop apps, the Tau command line and the Tau API, why we collect it, who sees it and what you can do about it. TAUCAD LIMITED, a New Zealand company, is the controller of your personal information.

**In short**

- Your projects live in your browser or on your device unless you use Tau Cloud, share them, or use AI features.
- On the free plan your agent chats are recorded to improve Tau unless you turn **Improve Tau for everyone** off. On paid plans they are not, unless you turn it on.
- We never sell your data and never let our AI providers train on it.
- Analytics on the web only run after you accept them.
- You can export your work and delete your account at any time.

## 1. What we collect

**Account.** Your email address, a name if you give one, your password (stored as a hash), and, if you sign in with GitHub or Google, the email, display name and profile picture they share with us. Also your plan, settings and privacy choices.

**Your content.** The prompts, chats, designs, code and files you create in Tau.

- By default they stay in your browser or on your device.
- Tau Cloud stores them for you if your plan includes it.
- If you share or publish a project, the people you share with can see it; a public publication is visible to anyone.
- When you use AI features, the prompt and the design context the agent needs are sent to the AI provider behind the model you chose (see [Who we share it with](#4-who-we-share-it-with)).
- If you connect GitHub, we store the access token GitHub gives us and use it only for the repositories and gists you choose.

**Payment.** Stripe handles payments. We never see your full card number; we receive the card brand, last four digits, country and the invoices Stripe issues.

**Usage and diagnostics.** The apps send Tau counts and timings about how Tau runs: which kernels run, how long operations take, how often they fail, memory use, export formats, sync outcomes and agent turn counts, token counts and error codes. They never include prompts, code, file names or geometry, and are not stored against your account. Operational metrics are always sent; you can switch the optional usage metrics off under **Settings → Data controls → Share usage and diagnostics**. The command line uses `tau telemetry off`.

**Product analytics.** On the web, PostHog records pages, clicks, feature use and session replays only after you accept analytics; replays mask all text and inputs. The desktop app records the same events, without replay, unless you turn this off in **Settings → Data controls**. Details are in our [Storage and Cookie Policy](/legal/cookies).

**Error and crash reports.** When Tau hits an error, it sends Sentry the error message and stack trace, the app version and route, your browser, operating system and device, and recent technical events; desktop crash reports may include a memory snapshot of the crashed process. Reports may carry your internal account id so we can tell how many people a fault affects, never your name or email, and cookies, tokens and authorization headers are stripped first. If the browser stops a Tau page (for example because it ran out of memory), the next load sends a short diagnostic report: which kernel was running, which step it had reached, memory and geometry sizes and recent technical events, never your code, parameter values, file names or geometry. That report is usage and diagnostics data: it is sent only while **Share usage and diagnostics** is on and never carries your account id. Tau does not ask you about it.

**Voice.** If you dictate a prompt, the audio is sent to OpenAI for transcription and is not kept.

**Messages to us.** Emails and support requests you send us.

**Technical data.** Your IP address, browser and device details, and server logs of requests to our API. Our providers may derive an approximate location (city or region) from your IP address.

## 2. Improving Tau with your chats

Tau records agent tasks to find and fix failures, evaluate changes and improve the agent. A recording contains a task summary (counts, timings, models and outcomes) and the full task: your prompts, the designs Tau generated, tool calls and replies.

- **Free plan:** recording is on unless you turn it off. It is the price of free usage.
- **Paid plans:** recording is off unless the account owner turns it on.
- **The switch:** **Settings → Data controls → Improve Tau for everyone**. Turning it off stops new recordings and withdraws the permission your ratings gave; it does not delete existing recordings, which expire under the 180-day limit below. If you want them deleted sooner, email privacy@tau.new. Turning it off never affects your access to AI features.
- **Ratings:** rating an agent reply records that rating and the reply it rates. The rating control is hidden while the switch is off.
- **Shared material:** we do not record full tasks, or reuse content, in a project that belongs to another account or contains another account's material.
- **Who sees it:** Tau's team, for the purposes above. Recordings are stored with [Langfuse](https://langfuse.com/privacy) in the United States (Oregon), under a pseudonymous account id, never your name or email. Langfuse does not use them for its own purposes and has its AI features turned off for our data.
- **How long:** recordings are deleted no later than 180 days after capture, and promptly when you delete your account. Deleting a project does not delete them early.
- **What we never do:** share your designs with third parties for training, or let our AI providers train on your content.

We rely on our legitimate interest in improving Tau for the free-plan default, and on your consent when you turn the switch on yourself or rate a reply. Either way, turning the switch off is how you object or withdraw.

## 3. How we use information

We use what we collect to:

- run Tau and keep your account, projects and purchases working (performing our contract with you);
- send you service messages such as sign-in links, receipts and failed-payment notices (contract);
- find and fix faults, keep Tau secure and prevent abuse (our legitimate interests);
- understand how Tau is used and improve it (our legitimate interests, or your consent where we ask for it, as in sections 1 and 2);
- meet legal duties such as tax record-keeping (legal obligation).

We do not make decisions about you by automated means that have legal or similarly significant effects.

Providing account and payment details is a condition of having an account or a paid plan; everything else is optional, though some features will not work without it.

## 4. Who we share it with

- **Service providers** that host and run Tau for us, listed with their purpose and location on our [Sub-processors page](/legal/subprocessors). They may use your data only to provide their service to us. Under our agreements with them, our AI providers do not use your prompts to train their models; most keep requests for a short period, usually up to 30 days, to monitor abuse.
- **Services you choose to connect**, such as GitHub or Google for sign-in, or GitHub for repositories and gists. They handle your data under their own terms.
- **People you share with**, when you share or publish a project.
- **Authorities**, when the law requires it or to protect people, Tau or our users.
- **A buyer or successor**, if Tau is acquired or restructured; we will tell you before your data is transferred.

We do not sell personal information.

## 5. Where your data is processed

Our systems run on cloud services in the United States, and our team works from New Zealand. Your data is processed in those countries and wherever our providers listed on the [Sub-processors page](/legal/subprocessors) operate. Where European or United Kingdom data protection law applies, we rely on our providers' Data Privacy Framework certification or standard contractual clauses for transfers to the United States. New Zealand's Privacy Act 2020 is recognised by the European Commission as providing adequate protection.

## 6. How long we keep it

| Data | Kept for |
| --- | --- |
| Account and settings | Until you delete your account |
| Projects in Tau Cloud, shares and publications | Until you delete them; stored files are purged within 30 days |
| Agent task recordings and ratings | No later than 180 days after capture; promptly on account deletion |
| GitHub connection tokens | Until you disconnect GitHub or delete your account |
| Product analytics | Until our analytics provider deletes it under its retention rules |
| Error and crash reports | 90 days |
| Server logs | Up to 30 days |
| Support emails | Up to 3 years |
| Invoices and payment records | 7 years, as New Zealand tax law requires |

When you delete your account we delete your account data straight away, purge stored files within 30 days, and erase your recordings. We keep what the law requires us to keep.

## 7. Your rights

Wherever you live, you can ask us to show you the personal information we hold about you, correct it, delete it, or give you a copy in a usable format, and you can object to or ask us to restrict how we use it. Where we rely on your consent you can withdraw it at any time. Most of this you can do yourself: export projects from the app, change settings under **Settings → Data controls**, and delete your account there. For anything else, email privacy@tau.new; we will answer within a month, or sooner where the law where you live requires it.

If you are unhappy with how we handle your information you can complain to the Office of the New Zealand Privacy Commissioner ([privacy.org.nz](https://www.privacy.org.nz)) or, if you are in the European Union or United Kingdom, to your local data protection authority.

## 8. Security

Data is encrypted in transit and at rest. Access to production systems is limited to the people who need it and protected by strong authentication, and secrets are stored in managed secret stores. No system is perfectly secure; if a breach puts you at risk, we will tell you and the relevant regulators as the law requires.

## 9. Children

Tau is not for anyone under 16. We do not knowingly collect information from children under 16; if we learn that we have, we delete it.

## 10. Marketing

We currently send only service emails. If we start sending product news, it will be opt-in, every message will have an unsubscribe link, and opting out will never affect service emails.

## 11. Changes

We may update this policy. When we do, we change the date at the top. If a change materially affects you, we will tell you by email or in the app before it takes effect.

## 12. Contact

TAUCAD LIMITED
26 Merfield Street, Auckland 1072, New Zealand
privacy@tau.new

