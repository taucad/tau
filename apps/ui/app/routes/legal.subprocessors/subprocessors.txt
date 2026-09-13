# Sub-processors - TauCAD Limited

*Effective date: December 29, 2025*

This page lists all third-party service providers (sub-processors) that process personal data on behalf of TauCAD Limited in connection with our Service. This list is maintained in accordance with our [Privacy Policy](/legal/privacy) and applicable data protection laws.

We require all sub-processors to implement appropriate technical and organizational security measures and to process personal data only for the purposes we specify.

## Infrastructure and Hosting

| Sub-processor | Purpose | Data Processed | Location | Certifications |
|---------------|---------|----------------|----------|----------------|
| **Fly.io** | API application hosting | Data stored and transmitted through our API hosting infrastructure, including request/response data, IP addresses, and server logs | USA | SOC 2 Type II |
| **Netlify** | Frontend hosting and CDN | Static assets, IP addresses, request headers | USA | SOC 2 Type II |
| **Supabase** | Database and backend services | User account data, authentication data, application data stored in PostgreSQL database | USA | SOC 2 Type II, HIPAA |

## AI and Machine Learning Services

When you use AI-assisted CAD features, your prompts and relevant context may be processed by the following providers. Your data is not retained by these providers for their own training purposes.

| Sub-processor | Purpose | Data Processed | Location | Certifications |
|---------------|---------|----------------|----------|----------------|
| **OpenAI** | AI language models (GPT) | Prompts, CAD context, conversation history | USA | SOC 2 Type II |
| **Anthropic** | AI language models (Claude) | Prompts, CAD context, conversation history | USA | SOC 2 Type II |
| **Google (Vertex AI)** | AI model services (Gemini) | Prompts, CAD context, conversation history | USA | SOC 1/2/3, ISO 27001, ISO 27017, ISO 27018 |
| **SambaNova** | AI model services (optional) | Prompts, CAD context when model is selected | USA | SOC 2 Type II |
| **Cerebras** | AI model services (optional) | Prompts, CAD context when model is selected | USA | SOC 2 Type II |
| **Tavily** | Web search for AI features | Search queries when web search is enabled | USA | SOC 2 Type II |

## CAD Processing

| Sub-processor | Purpose | Data Processed | Location | Certifications |
|---------------|---------|----------------|----------|----------------|
| **Zoo.dev (KittyCAD)** | KCL CAD kernel processing | CAD code, model geometry, rendering data | USA | SOC 2 Type II |

## Analytics and Observability

| Sub-processor | Purpose | Data Processed | Location | Certifications |
|---------------|---------|----------------|----------|----------------|
| **PostHog** | Product analytics (with consent) | Usage data, device info, interaction patterns | USA | SOC 2 Type II |
| **LangSmith** | AI feature observability | AI interaction logs, prompt/response metadata | USA | SOC 2 Type II |

## Payment Processing

| Sub-processor | Purpose | Data Processed | Location | Certifications |
|---------------|---------|----------------|----------|----------------|
| **Stripe** | Payment processing | Payment method details, billing information | USA | PCI DSS Level 1, SOC 1/2, ISO 27001 |

## Authentication Services

When you choose to sign in using third-party authentication, we receive certain information from these providers.

| Sub-processor | Purpose | Data Processed | Location | Certifications |
|---------------|---------|----------------|----------|----------------|
| **GitHub** | OAuth authentication | Email, display name, profile picture (if authorized) | USA | SOC 1/2, ISO 27001 |
| **Google** | OAuth authentication | Email, name, profile picture (if authorized) | USA | SOC 1/2/3, ISO 27001 |

## Changes to This List

We will update this list when we add or remove sub-processors. For material changes, we will notify you in accordance with our [Privacy Policy](/legal/privacy).

## Notification of Changes

To receive notifications when we update this sub-processor list, you may:
- Subscribe to repository notifications at [https://github.com/taucad/tau](https://github.com/taucad/tau)
- Email privacy@tau.new with "Sub-processor Updates" in the subject line to be added to our notification list

We will provide at least 30 days' notice before engaging new sub-processors that process personal data, allowing you to review and raise any objections.

## Contact Us

If you have questions about our sub-processors or data processing practices, please contact us at [privacy@tau.new](mailto:privacy@tau.new).

