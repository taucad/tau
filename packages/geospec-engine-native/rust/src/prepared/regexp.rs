//! ECMAScript selector test adapter over the pinned Rust regex implementation.
//!
//! Instances are batch-owned. Matching has no fuel/backtracking bound; the
//! deterministic claim work ledger must not be presented as such a bound.

use std::{cell::RefCell, collections::HashMap, rc::Rc};

use crate::analysis::selection::{EcmaRegexEngine, EcmaRegexError};
use regress::{Flags, Regex};

struct CompiledPattern {
    regex: Regex,
    unicode: bool,
    sticky: bool,
}

/// One pattern's compiles, keyed by the authored flags that compiled.
type FlagCompiles = Vec<(String, Rc<CompiledPattern>)>;

/// Compiled patterns by pattern text, then by the authored flags. A hit is a
/// borrowed lookup, so testing a value allocates no key (C11). Only flags that
/// compiled are stored, so a hit implies they were valid.
#[derive(Default)]
pub(crate) struct SelectorRegex {
    compiled: RefCell<HashMap<String, FlagCompiles>>,
}

impl SelectorRegex {
    fn compile(&self, pattern: &str, flags: &str) -> Result<Rc<CompiledPattern>, EcmaRegexError> {
        if let Some(compiled) = self.compiled.borrow().get(pattern).and_then(|entries| {
            entries
                .iter()
                .find(|(authored, _)| authored == flags)
                .map(|(_, compiled)| Rc::clone(compiled))
        }) {
            return Ok(compiled);
        }
        canonical_flags(flags)?;
        if flags.contains('v') {
            return Err(EcmaRegexError::Unsupported("ECMAScript UnicodeSets selectors (v flag) are not qualified by this regex implementation profile.".into()));
        }
        let unicode = flags.contains('u');
        let options = Flags {
            icase: flags.contains('i'),
            multiline: flags.contains('m'),
            dot_all: flags.contains('s'),
            unicode,
            ..Flags::default()
        };
        // Non-u JavaScript patterns and input operate on UTF-16 code units.
        // Unicode mode parses scalar code points and combines input surrogates.
        let regex = if unicode {
            Regex::from_unicode(pattern.chars().map(u32::from), options)
        } else {
            Regex::from_unicode(pattern.encode_utf16().map(u32::from), options)
        }.map_err(|error| {
            let message = error.to_string();
            match message.as_str() {
                "Incomplete escape" | "Unterminated escape" | "Unbalanced parenthesis" | "Unbalanced bracket" =>
                    EcmaRegexError::InvalidSyntax(format!("Invalid ECMAScript selector pattern: {message}.")),
                _ => EcmaRegexError::Unsupported(format!("ECMAScript selector pattern could not be supported by regress 0.11.1: {message}.")),
            }
        })?;
        let compiled = Rc::new(CompiledPattern {
            regex,
            unicode,
            sticky: flags.contains('y'),
        });
        self.compiled
            .borrow_mut()
            .entry(pattern.to_owned())
            .or_default()
            .push((flags.to_owned(), Rc::clone(&compiled)));
        Ok(compiled)
    }
}

/// Validate JavaScript flags without regress's silently-ignored flag behavior.
pub(crate) fn canonical_flags(flags: &str) -> Result<String, EcmaRegexError> {
    const ORDER: &str = "dgimsuvy";
    let mut seen = [false; 8];
    for flag in flags.chars() {
        let Some(index) = ORDER.chars().position(|candidate| candidate == flag) else {
            return Err(EcmaRegexError::InvalidSyntax(format!(
                "Invalid ECMAScript selector flag '{flag}'."
            )));
        };
        if seen[index] {
            return Err(EcmaRegexError::InvalidSyntax(format!(
                "Duplicate ECMAScript selector flag '{flag}'."
            )));
        }
        seen[index] = true;
    }
    if seen[5] && seen[6] {
        return Err(EcmaRegexError::InvalidSyntax(
            "ECMAScript selector flags u and v are mutually exclusive.".into(),
        ));
    }
    Ok(ORDER
        .chars()
        .enumerate()
        .filter_map(|(index, flag)| seen[index].then_some(flag))
        .collect())
}

impl EcmaRegexEngine for SelectorRegex {
    fn validate(&self, pattern: &str, flags: &str) -> Result<(), EcmaRegexError> {
        self.compile(pattern, flags).map(|_| ())
    }

    fn test(&self, pattern: &str, flags: &str, value: &str) -> Result<bool, EcmaRegexError> {
        let compiled = self.compile(pattern, flags)?;
        let units: Vec<u16> = value.encode_utf16().collect();
        let found = if compiled.unicode {
            compiled.regex.find_from_utf16(&units, 0).next()
        } else {
            compiled.regex.find_from_ucs2(&units, 0).next()
        };
        // There is no retained lastIndex. g/d do not alter this boolean test;
        // y requires the match to begin at the explicitly reset index zero.
        Ok(found.is_some_and(|matched| !compiled.sticky || matched.start() == 0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeated_tests_reuse_one_compile_and_invalid_flags_still_refuse() {
        let engine = SelectorRegex::default();
        let first = engine.compile("^a", "i").unwrap();
        assert!(engine.test("^a", "i", "Abc").unwrap());
        assert!(Rc::ptr_eq(&first, &engine.compile("^a", "i").unwrap()));
        assert_eq!(engine.compiled.borrow()["^a"].len(), 1);
        assert!(matches!(
            engine.validate("^a", "ii"),
            Err(EcmaRegexError::InvalidSyntax(_))
        ));
        assert!(!engine.test("^a", "", "Abc").unwrap());
        assert_eq!(engine.compiled.borrow()["^a"].len(), 2);
    }

    #[test]
    fn ordinary_selector_features_match_independently_frozen_js_controls() {
        let corpus: serde_json::Value = serde_json::from_str(include_str!(
            "../../../conformance/selector-regexp-corpus.json"
        ))
        .unwrap();
        let engine = SelectorRegex::default();
        for row in corpus["rows"].as_array().unwrap() {
            let id = row["id"].as_str().unwrap();
            let pattern = row["pattern"].as_str().unwrap();
            let flags = row["flags"].as_str().unwrap();
            let value = row["value"].as_str().unwrap();
            match row["expectedCandidate"].as_str().unwrap() {
                "invalid-syntax" => assert!(
                    matches!(
                        engine.validate(pattern, flags),
                        Err(EcmaRegexError::InvalidSyntax(_))
                    ),
                    "{id}"
                ),
                "unsupported" => assert!(
                    matches!(
                        engine.validate(pattern, flags),
                        Err(EcmaRegexError::Unsupported(_))
                    ),
                    "{id}: unsupported is a visible limitation, not JS parity"
                ),
                "same-boolean" => {
                    engine
                        .validate(pattern, flags)
                        .unwrap_or_else(|error| panic!("{id}: {error:?}"));
                    for expected in row["expectedJs"].as_array().unwrap() {
                        assert_eq!(
                            engine.test(pattern, flags, value).unwrap(),
                            expected.as_bool().unwrap(),
                            "{id}"
                        );
                    }
                }
                other => panic!("unknown independently authored disposition {other}"),
            }
        }
    }
}
