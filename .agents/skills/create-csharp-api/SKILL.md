---
name: create-csharp-api
description: Designs a C#/.NET API with compiled call-site sketches in a browser-viewable DX guide. Use for overloads, named arguments, extension methods, attributes, records, errors, or C# CAD authoring; compose create-api for shared review.
---

# C# API design

Follow [create-api](../create-api/SKILL.md) and its [authoring contract](../create-api/authoring.md).

- Compile against the actual pinned SDK and assemblies. Show `using` directives, natural overload
  selection, optional and named arguments, loops, and disposal when relevant. Prefer existing .NET
  idioms and one obvious call over a parallel builder or registry.
- For a proposed member of an external class, a sketch-only extension method may stand in for
  compilation. Label it as a compiler stand-in and record the required owner change; it is not a
  shipping implementation.
- Put C# sketches in `design/**/*.cs`, at most one file with top-level statements. Use
  `// expect-error CSxxxx` immediately before an invalid line. Run the common checker with
  `--dotnet` and repeatable `--reference` paths. Check successful calls and misuse against the
  real C# compiler, and record the .NET version.
