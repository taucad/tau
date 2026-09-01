---
name: langgraph
description: 'Answers questions about LangGraph and agentic AI using the langgraph-docs-mcp server. Use when the user asks about LangGraph, agentic AI, agent graphs, tool use, or graph-based workflows.'
---

for ANY question about LangGraph, use the langgraph-docs-mcp server to help answer --

- call list_doc_sources tool to get the available llms.txt file
- call fetch_docs tool to read it
- reflect on the urls in llms.txt
- reflect on the input question
- call fetch_docs on any urls relevant to the question
- use this to answer the question
