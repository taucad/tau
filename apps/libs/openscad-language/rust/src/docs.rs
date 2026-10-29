//! Doc comments: a description, `@param`/`@returns`/`@example`/`@see`/`@deprecated` tags, and `{@link name}` links.

use crate::index::Decl;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct DocComment {
    pub description: String,
    pub params: Vec<(String, String)>,
    pub returns: Option<String>,
    pub examples: Vec<String>,
    pub see: Vec<String>,
    pub deprecated: Option<String>,
}

impl DocComment {
    pub fn parse(text: &str) -> Self {
        let mut doc = Self::default();
        let mut description = Vec::new();
        let mut current: Option<(String, Vec<String>)> = None;
        let flush = |doc: &mut Self, tag: Option<(String, Vec<String>)>| {
            let Some((name, lines)) = tag else { return };
            let body = lines.join("\n");
            match name.as_str() {
                "param" | "arg" | "argument" => {
                    let body = body.trim_start();
                    let (param, rest) = body.split_once(char::is_whitespace).unwrap_or((body, ""));
                    let rest = rest.trim_start().strip_prefix("- ").unwrap_or(rest.trim_start());
                    doc.params.push((param.to_owned(), rest.trim().to_owned()));
                }
                "return" | "returns" => doc.returns = Some(body.trim().to_owned()),
                "example" => doc.examples.push(trim_block(&body)),
                "see" => doc.see.push(body.trim().to_owned()),
                "deprecated" => doc.deprecated = Some(body.trim().to_owned()),
                _ => {}
            }
        };
        for line in text.lines() {
            let trimmed = line.trim_start();
            if let Some(tagged) = trimmed.strip_prefix('@') {
                let (name, rest) = tagged.split_once(char::is_whitespace).unwrap_or((tagged, ""));
                if name.chars().all(|character| character.is_ascii_alphabetic()) && !name.is_empty() {
                    flush(&mut doc, current.take());
                    current = Some((name.to_owned(), vec![rest.to_owned()]));
                    continue;
                }
            }
            match &mut current {
                Some((_, lines)) => lines.push(line.to_owned()),
                None => description.push(line),
            }
        }
        flush(&mut doc, current);
        doc.description = description.join("\n").trim().to_owned();
        doc
    }

    pub fn param(&self, name: &str) -> Option<&str> {
        self.params.iter().find(|(param, _)| param == name).map(|(_, text)| text.as_str())
    }
}

fn trim_block(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.iter().position(|line| !line.trim().is_empty()).unwrap_or(lines.len());
    let end = lines.iter().rposition(|line| !line.trim().is_empty()).map_or(start, |end| end + 1);
    lines[start..end].join("\n")
}

/// A resolved `{@link}` target, rendered as an editor location link.
pub struct LinkTarget {
    pub uri: String,
    /// Zero-based line and UTF-16 character.
    pub line: u32,
    pub character: u32,
}

/// Render `{@link name}`, `{@link name text}`, `{@linkcode name}` and `{@link https://… text}` as markdown links.
/// Names that do not resolve stay as code, the way VS Code shows unresolved links.
pub fn render_links(text: &str, resolve: &dyn Fn(&str) -> Option<LinkTarget>) -> String {
    let mut output = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("{@link") {
        output.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        let Some(end) = after.find('}') else {
            output.push_str(&rest[start..]);
            return output;
        };
        let inner = &after[..end];
        let (tag, body) = inner.split_once(char::is_whitespace).unwrap_or((inner, ""));
        if !matches!(tag, "@link" | "@linkcode" | "@linkplain") {
            output.push_str(&rest[start..start + 2 + end]);
            rest = &after[end + 1..];
            continue;
        }
        let body = body.trim();
        let (target, label) = match body.split_once(['|', ' ']) {
            Some((target, label)) => (target.trim(), label.trim()),
            None => (body, ""),
        };
        let code = tag != "@linkplain";
        if target.starts_with("http://") || target.starts_with("https://") {
            if label.is_empty() {
                output.push_str(&format!("<{target}>"));
            } else {
                output.push_str(&format!("[{}]({target})", escape(label)));
            }
        } else {
            let shown = if label.is_empty() { target } else { label };
            let shown = if code && label.is_empty() { format!("`{shown}`") } else { escape(shown) };
            match resolve(target) {
                Some(location) => output.push_str(&format!(
                    "[{shown}]({}#L{},{})",
                    location.uri,
                    location.line + 1,
                    location.character + 1
                )),
                None => output.push_str(&shown),
            }
        }
        rest = &after[end + 1..];
    }
    output.push_str(rest);
    output
}

fn escape(text: &str) -> String {
    let mut escaped = String::with_capacity(text.len());
    for character in text.chars() {
        if matches!(character, '\\' | '`' | '*' | '_' | '[' | ']' | '(' | ')' | '<' | '>' | '#') {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    escaped
}

/// Markdown for hover and completion documentation: signature block, description and tags.
pub fn markdown(decl: &Decl, origin: Option<&str>, resolve: &dyn Fn(&str) -> Option<LinkTarget>) -> String {
    let mut sections = vec![format!("```openscad\n{}\n```", decl_heading(decl))];
    let doc = DocComment::parse(&decl.doc);
    if let Some(deprecated) = &doc.deprecated {
        sections.push(format!("*@deprecated* {}", render_links(deprecated, resolve)).trim_end().to_owned());
    }
    if !doc.description.is_empty() {
        sections.push(render_links(&doc.description, resolve));
    }
    let params: Vec<String> = decl
        .params
        .iter()
        .filter_map(|param| doc.param(&param.name).map(|text| (param, text)))
        .map(|(param, text)| {
            if text.is_empty() {
                format!("*@param* `{}`", param.name)
            } else {
                format!("*@param* `{}` — {}", param.name, render_links(text, resolve))
            }
        })
        .collect();
    if !params.is_empty() {
        sections.push(params.join("  \n"));
    }
    if let Some(returns) = &doc.returns {
        sections.push(format!("*@returns* {}", render_links(returns, resolve)));
    }
    for example in &doc.examples {
        sections.push(format!("*@example*\n```openscad\n{example}\n```"));
    }
    for see in &doc.see {
        sections.push(format!("*@see* {}", render_links(&linkify_see(see), resolve)));
    }
    if let Some(origin) = origin {
        sections.push(origin.to_owned());
    }
    sections.join("\n\n")
}

/// `@see name` links the name, as `@see {@link name}` would.
fn linkify_see(text: &str) -> String {
    if text.contains("{@link") || text.contains(char::is_whitespace) || text.is_empty() {
        text.to_owned()
    } else {
        format!("{{@link {text}}}")
    }
}

fn decl_heading(decl: &Decl) -> String {
    use crate::index::DeclKind;
    match decl.kind {
        DeclKind::Module | DeclKind::Function => decl.signature(),
        DeclKind::Parameter => {
            let owner = decl.owner.as_deref().map(|owner| format!(" of {owner}")).unwrap_or_default();
            format!("(parameter{owner}) {}", decl.signature())
        }
        DeclKind::LoopVariable => format!("(loop variable) {}", decl.signature()),
        DeclKind::LetVariable => format!("(let) {}", decl.signature()),
        DeclKind::Variable if !decl.params.is_empty() => {
            format!("{} = function ({})", decl.name, decl.parameter_list())
        }
        DeclKind::Variable => decl.signature(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_tags() {
        let doc =
            DocComment::parse("A gear.\nTwo lines.\n@param teeth - Tooth count\n@example\ngear(3);\n@returns nothing");
        assert_eq!(doc.description, "A gear.\nTwo lines.");
        assert_eq!(doc.param("teeth"), Some("Tooth count"));
        assert_eq!(doc.examples, vec!["gear(3);".to_owned()]);
        assert_eq!(doc.returns.as_deref(), Some("nothing"));
    }

    #[test]
    fn renders_links() {
        let resolve = |name: &str| {
            (name == "spur").then(|| LinkTarget { uri: "file:///gears.scad".to_owned(), line: 2, character: 7 })
        };
        assert_eq!(
            render_links(
                "See {@link spur}, {@link spur the spur}, {@link nope} and {@link https://openscad.org docs}.",
                &resolve
            ),
            "See [`spur`](file:///gears.scad#L3,8), [the spur](file:///gears.scad#L3,8), `nope` and [docs](https://openscad.org)."
        );
    }
}
