# Sub-processors

*Effective date: November 8, 2026*

These are the companies that process personal data on behalf of TAUCAD LIMITED to run Tau. Each may use the data only to provide its service to us and must protect it under a written agreement with us. Our [Privacy Policy](/legal/privacy) explains what we collect and why.

## Hosting and infrastructure

| Provider | What it does for us | Data it handles | Location |
| --- | --- | --- | --- |
| Fly.io (including its managed Redis, run by Upstash) | Runs the Tau API | Everything the API processes: requests and responses, IP addresses, server logs | United States |
| Supabase | Hosts our database | Account data, settings, project metadata, billing records | United States |
| Cloudflare | Stores files (R2), serves our CDN, and provides DNS and web security | Projects in Tau Cloud, publications and shared files, request data and IP addresses | United States |
| Netlify | Hosts the website and web app | Request data and IP addresses | United States |
| Resend | Sends our service emails | Email address, name, email content | United States |

## AI models

When you use an AI feature, your prompt and the design context the agent needs go to the provider behind the model you chose. Under our agreements with them, none of these providers uses your data to train its models.

| Provider | What it does for us | Data it handles | Location |
| --- | --- | --- | --- |
| OpenAI | GPT models; voice dictation transcription | Prompts, design context, chat history; dictation audio | United States |
| Anthropic | Claude models | Prompts, design context, chat history | United States |
| Google (Vertex AI) | Gemini models | Prompts, design context, chat history | United States |
| xAI | Grok models | Prompts, design context, chat history | United States |
| Together AI | Open-weight models | Prompts, design context, chat history | United States |
| Morph | Open-weight models | Prompts, design context, chat history | United States |

## Payments

| Provider | What it does for us | Data it handles | Location |
| --- | --- | --- | --- |
| Stripe | Processes payments and issues invoices | Payment method, billing name and address, invoices | United States |

## Analytics, errors and observability

| Provider | What it does for us | Data it handles | Location |
| --- | --- | --- | --- |
| PostHog | Product analytics (on the web, after you accept) | Usage events, device information, session replays with text masked | United States |
| Sentry | Error and crash reports | Error messages, stack traces, app and device details, desktop crash memory snapshots | United States |
| Grafana Labs | Server logs and metrics | API logs and performance metrics | United States |
| Langfuse (Langfuse GmbH, part of ClickHouse, Inc.) | Stores agent task recordings (Privacy Policy section 2) | Task summaries and ratings and, when your setting allows it, prompts, designs, tool calls and replies, under a pseudonymous account id | United States (Oregon) |

Sign-in through GitHub or Google, and GitHub repositories you connect, are services you choose to use under their own terms; they are not sub-processors.

## Changes

We update this page when the list changes and change the date at the top. Every change is recorded in the page's history in our public repository at [github.com/taucad/tau](https://github.com/taucad/tau/commits/main/apps/www/content/legal/subprocessors.md), which you can watch for notifications.

## Contact

[privacy@tau.new](mailto:privacy@tau.new)
