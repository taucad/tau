---
workbench-panes: minor
agent-plugin: minor
---

The Share pane's link methods offer a generated password.

- **`@taucad/workbench-panes`**: the password option reads "Protect with a password". Turning it on fills a random password of letters and digits (24 long, or the method's `encryption.minBytes` when that is more, within `maxBytes`) that the person can keep, edit or replace with **Generate**. **Copy password** copies it inside the press and announces "Password copied"; a refused clipboard says so in the pane. Once the link exists the password is read-only but can still be shown and copied, and a link without the password says to send the password separately.
- **`@taucad/agent-plugin`**: the viewer page's direct link gets the same password option.
