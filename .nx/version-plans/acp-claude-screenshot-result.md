---
host: patch
---

Claude Code screenshots through Tau's MCP server now reach the chat as captured images. Claude Code hands its model a Tau screenshot result as one `[Resource link: …]` text block per image followed by the structured result as JSON in the final text block. The host parsed every text block joined together, so the JSON never parsed and each Claude screenshot failed with `MCP_RESULT_MISSING`. The host now reads the structured result from the final text block, which is where Claude Code puts it for every Tau tool.
