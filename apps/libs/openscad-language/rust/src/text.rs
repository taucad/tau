//! Byte offsets inside the server, UTF-16 line/character positions on the LSP wire.

use serde_json::{Value, json};

/// Byte offsets of each line start, for converting between byte offsets and LSP positions.
#[derive(Clone, Debug, Default)]
pub struct LineIndex {
    starts: Vec<usize>,
}

impl LineIndex {
    pub fn new(text: &str) -> Self {
        let mut starts = vec![0];
        starts.extend(text.match_indices('\n').map(|(index, _)| index + 1));
        Self { starts }
    }

    pub fn line_count(&self) -> usize {
        self.starts.len()
    }

    pub fn line_start(&self, line: usize) -> usize {
        self.starts[line.min(self.starts.len() - 1)]
    }

    /// The zero-based line holding `offset`.
    pub fn line_of(&self, offset: usize) -> usize {
        match self.starts.binary_search(&offset) {
            Ok(line) => line,
            Err(next) => next - 1,
        }
    }

    /// LSP position (UTF-16 character) of a byte offset; offsets inside a character snap to its start.
    pub fn position(&self, text: &str, offset: usize) -> Position {
        let offset = floor_boundary(text, offset.min(text.len()));
        let line = self.line_of(offset);
        let start = self.starts[line];
        let character = text[start..offset].encode_utf16().count();
        Position { line: line as u32, character: character as u32 }
    }

    /// Byte offset of an LSP position, clamped to the line's end the way editors clamp.
    pub fn offset(&self, text: &str, position: Position) -> usize {
        let line = position.line as usize;
        if line >= self.starts.len() {
            return text.len();
        }
        let start = self.starts[line];
        let end = self.starts.get(line + 1).map_or(text.len(), |next| next - 1);
        let mut units = 0u32;
        for (index, character) in text[start..end].char_indices() {
            if units >= position.character {
                return start + index;
            }
            units += character.len_utf16() as u32;
        }
        end
    }

    pub fn range(&self, text: &str, start: usize, end: usize) -> Range {
        Range { start: self.position(text, start), end: self.position(text, end) }
    }
}

fn floor_boundary(text: &str, mut offset: usize) -> usize {
    while offset > 0 && !text.is_char_boundary(offset) {
        offset -= 1;
    }
    offset
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord)]
pub struct Position {
    pub line: u32,
    pub character: u32,
}

impl Position {
    pub fn from_json(value: &Value) -> Option<Self> {
        Some(Self {
            line: u32::try_from(value.get("line")?.as_u64()?).ok()?,
            character: u32::try_from(value.get("character")?.as_u64()?).ok()?,
        })
    }

    pub fn to_json(self) -> Value {
        json!({ "line": self.line, "character": self.character })
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Range {
    pub start: Position,
    pub end: Position,
}

impl Range {
    pub fn from_json(value: &Value) -> Option<Self> {
        Some(Self { start: Position::from_json(value.get("start")?)?, end: Position::from_json(value.get("end")?)? })
    }

    pub fn to_json(self) -> Value {
        json!({ "start": self.start.to_json(), "end": self.end.to_json() })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_utf16_positions() {
        let text = "a = \"é😀\";\nb = 2;";
        let lines = LineIndex::new(text);
        let after_emoji = text.find('"').unwrap() + 1 + 'é'.len_utf8() + '😀'.len_utf8();
        let position = lines.position(text, after_emoji);
        assert_eq!(position, Position { line: 0, character: 8 });
        assert_eq!(lines.offset(text, position), after_emoji);
        assert_eq!(lines.offset(text, Position { line: 1, character: 99 }), text.len());
        assert_eq!(lines.offset(text, Position { line: 9, character: 0 }), text.len());
    }
}
