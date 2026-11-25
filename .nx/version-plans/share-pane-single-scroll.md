---
workbench-panes: minor
agent-plugin: minor
---

The Share pane scrolls as one region with flat, divided sections.

- **`@taucad/workbench-panes`**: `SharePaneFrame` is one scroll area holding the method picker, the chosen method's sections and the host's sections; nothing in it is pinned and nothing scrolls on its own. `SharePane({ extraSections })` adds host sections after the method's, under every method. `SharePaneSection` draws a full-width divider and an optional heading that names its region (`headingRef` lets a section move focus to it). `share/share-notice` exports `ShareNotice`, the pane's one notice: a neutral surface with the tone on its glyph and optional actions. `ShareMethodBase` now requires `description`, one sentence shown in the method's picker row and under the picker, so a `ShareCustomMethod` must carry one; `ShareLinkOption` takes an optional `description`. The pane no longer draws a notice card, a frame description or a per-method copied message: `ShareLinkMethod.notice`, `ShareLinkMethod.copiedMessage`, `ShareLinkMethod.encryption.notice`, `ShareLinkNotice` and `SharePaneFrameProperties.description` are deprecated and ignored, and will be removed. The password field shows and hides its value and asks for "at least N characters"; every copy announces "Link copied"; a refused clipboard focuses and selects the link; the primary button sets `aria-busy` while it works.
- **`@taucad/agent-plugin`**: the viewer page's direct link says "The whole project travels in the link, so anyone with the link can open it. Nothing is uploaded.", its button reads "Copy link", a project too large for a direct link says so, and any other refusal reads "Couldn't create the link. Try again." rather than the server's message.
