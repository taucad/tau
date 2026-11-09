# Storage and Cookie Policy

*Effective date: November 8, 2026*

This page explains what TAUCAD LIMITED ("Tau", "we") stores in your browser and on your device, and how to change your analytics choice. Read it with our [Privacy Policy](/legal/privacy).

## Necessary cookies on the web

These make the website and web app work. They are set without asking.

| Purpose | Cookie | Kept for |
| --- | --- | --- |
| Keeping you signed in | Session cookie (Secure, HttpOnly, SameSite=Lax) | Up to 7 days |
| Showing your theme without a flash | Theme cookie (HttpOnly, SameSite=Lax) | Browser session |
| Opening the app directly on your next visit to tau.new | `tau-entry` | 30 days |
| Remembering your analytics choice | `tau-cookie-consent`, containing only "accepted" or "declined" | Up to 365 days |

If the consent cookie is missing, expired or from an older version of this policy, we ask again before analytics start.

## Local storage for your preferences and projects

Interface choices (sidebar state, kernel, model, editor and display preferences) are kept in `localStorage`. Your local projects and files are kept in IndexedDB or the Origin Private File System in the web app, and on disk in the desktop app. None of this is analytics. It stays until you delete it, clear the site or app data, or uninstall the app.

## Optional analytics

On the web, Tau asks on your first visit whether to allow analytics. If you accept, PostHog Cloud records page views, browser and device information, feature use, your account identity when you are signed in, error events and session replays, and stores its own first-party cookies and local storage. Replays mask all text and inputs. If your choice is unknown, declined or withdrawn, PostHog is not started and nothing is sent.

The desktop app sends the same analytics, without session replay, unless you turn it off in **Settings → Data controls**, and keeps its analytics identity in the app's local storage rather than in a cookie.

PostHog receives this data; see the [PostHog privacy policy](https://posthog.com/privacy).

## Changing your choice

Use **Cookie preferences** in the website footer, the **Manage cookie preferences** control on this page, or **Help → Cookie preferences** in the Tau web app. In the desktop app use **Settings → Data controls**. One choice covers the website and the web app on the same domain.

Withdrawing consent stops capture and replay, resets the analytics identity and clears PostHog's stored data. It does not remove the necessary cookies or your local projects.

If your browser sends a Global Privacy Control signal, Tau treats it as a decline: analytics stay off and the question is not shown.

## Usage metrics sent to Tau

Signed in, the apps also send Tau anonymous usage and diagnostics metrics over your existing session. They set no cookies and do not use PostHog. What they contain, and the **Share usage and diagnostics** switch that controls the optional part, are described in section 1 of our [Privacy Policy](/legal/privacy).

## Browser controls

You can inspect, block or delete cookies and site storage in your browser. Blocking the necessary cookies may stop sign-in, saved preferences or local projects from working.

## Changes and contact

We update this page when what we store changes; a new analytics purpose means we ask for your choice again. Questions: [privacy@tau.new](mailto:privacy@tau.new).
