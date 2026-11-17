//! The shell's per-launch AppContainer, as plain data: the package name and SID shapes, what the shell's
//! token must look like, and the SDDL comparison the ACL restore uses once a launch has set a mandatory
//! label. Everything here is portable and unit-tested on any host; the Win32 side is `win/lowbox.rs`.

/// The prefix of every per-launch AppContainer name. The rest is 128 random bits in hex, so no two launches
/// (concurrent or later) ever share a package SID, and with it any grant.
pub const PACKAGE_NAME_PREFIX: &str = "tau.sandbox.";

/// `S-1-16-4096`: the Low mandatory level every AppContainer token carries.
pub const LOW_INTEGRITY_SID: &str = "S-1-16-4096";

/// A fresh AppContainer name (`tau.sandbox.<32 hex digits>`, 44 characters: within the 64 that
/// `DeriveAppContainerSidFromAppContainerName` accepts).
pub fn package_name(random: [u32; 4]) -> String {
    let [a, b, c, d] = random;
    format!("{PACKAGE_NAME_PREFIX}{a:08x}{b:08x}{c:08x}{d:08x}")
}

/// Whether `sid` is an AppContainer package SID: `S-1-15-2-` and seven 32-bit sub-authorities (the shape
/// `DeriveAppContainerSidFromAppContainerName` produces). Capability SIDs (`S-1-15-3-…`) and the
/// `ALL APPLICATION PACKAGES` (`S-1-15-2-1`) and `ALL RESTRICTED APPLICATION PACKAGES` (`S-1-15-2-2`)
/// group SIDs are not package SIDs.
pub fn is_package_sid(sid: &str) -> bool {
    let Some(rest) = sid.strip_prefix("S-1-15-2-") else { return false };
    let parts: Vec<&str> = rest.split('-').collect();
    parts.len() == 7 && parts.iter().all(|p| !p.is_empty() && p.len() <= 10 && p.parse::<u32>().is_ok())
}

/// What the runner reads back from the shell's own token before it lets the shell run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TokenFacts {
    pub user: String,
    /// `TokenIsAppContainer`.
    pub app_container: bool,
    /// `TokenAppContainerSid`, when there is one.
    pub package: Option<String>,
    /// `TokenCapabilities`.
    pub capabilities: Vec<String>,
    /// `TokenRestrictedSids`.
    pub restricted: Vec<String>,
    /// `TokenIntegrityLevel`.
    pub integrity: String,
}

impl TokenFacts {
    /// One log line for the launcher's diagnostic log.
    pub fn describe(&self) -> String {
        format!(
            "user={} appContainer={} package={} capabilities=[{}] restricted=[{}] integrity={}",
            self.user,
            self.app_container,
            self.package.as_deref().unwrap_or("none"),
            self.capabilities.join(","),
            self.restricted.join(","),
            self.integrity
        )
    }
}

/// The shell's token must be an AppContainer token for exactly this launch's package, with no capability
/// at all, still write-restricted by this launch's capability SID, at Low integrity. Anything else is
/// refused before the shell's first instruction runs.
pub fn verify_token(facts: &TokenFacts, package: &str, capability: &str) -> Result<(), String> {
    if !facts.app_container {
        return Err("the shell's token is not an AppContainer token".to_owned());
    }
    match facts.package.as_deref() {
        Some(actual) if actual.eq_ignore_ascii_case(package) => {}
        Some(actual) => return Err(format!("the shell's package SID is {actual}, not this launch's {package}")),
        None => return Err("the shell's token names no package SID".to_owned()),
    }
    if !facts.capabilities.is_empty() {
        return Err(format!("the shell's token carries capabilities: {}", facts.capabilities.join(",")));
    }
    if !facts.restricted.iter().any(|sid| sid.eq_ignore_ascii_case(capability)) {
        return Err("the shell's token is not restricted by this launch's capability SID".to_owned());
    }
    if facts.integrity != LOW_INTEGRITY_SID {
        return Err(format!("the shell's token runs at {}, not Low integrity", facts.integrity));
    }
    Ok(())
}

/// Split SDDL (`O:…G:…D:…S:…`) at its top-level `S:` section: what comes before it, and the SACL part
/// (starting with `S:`, empty when there is none). ACE bodies inside parentheses are skipped, so nothing in
/// an ACE can be mistaken for the section tag; no SID or alias spelling contains `S:`.
pub fn split_sacl(sddl: &str) -> (&str, &str) {
    let bytes = sddl.as_bytes();
    let mut depth = 0usize;
    for (index, &byte) in bytes.iter().enumerate() {
        match byte {
            b'(' => depth += 1,
            b')' => depth = depth.saturating_sub(1),
            b'S' if depth == 0 && bytes.get(index + 1) == Some(&b':') => return sddl.split_at(index),
            _ => {}
        }
    }
    (sddl, "")
}

/// The mandatory-label ACEs (`(ML;…)`) of a SACL part, in order, as written.
pub fn label_aces(sacl: &str) -> Vec<&str> {
    let mut aces = Vec::new();
    let mut start = None;
    for (index, byte) in sacl.bytes().enumerate() {
        match byte {
            b'(' if start.is_none() => start = Some(index),
            b')' => {
                if let Some(begin) = start.take() {
                    let ace = &sacl[begin..=index];
                    if ace.starts_with("(ML;") {
                        aces.push(ace);
                    }
                }
            }
            _ => {}
        }
    }
    aces
}

/// Whether a descriptor read back after a restore is the journaled one: owner, group, DACL and the DACL's
/// control flags exactly, and the same mandatory-label ACEs. The SACL's own control flags (`S:AI`, `S:P`)
/// are not compared: writing them needs `SACL_SECURITY_INFORMATION` and with it `SeSecurityPrivilege`,
/// which a launch never has, and they carry no access.
pub fn restored(now: &str, journaled: &str) -> bool {
    let (now_rest, now_sacl) = split_sacl(now);
    let (journaled_rest, journaled_sacl) = split_sacl(journaled);
    now_rest == journaled_rest && label_aces(now_sacl) == label_aces(journaled_sacl)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PACKAGE: &str = "S-1-15-2-1-2-3-4-5-6-4294967295";
    const CAPABILITY: &str = "S-1-5-21-11-22-33-44";

    fn facts() -> TokenFacts {
        TokenFacts {
            user: "S-1-5-21-9-9-9-1001".into(),
            app_container: true,
            package: Some(PACKAGE.into()),
            capabilities: Vec::new(),
            restricted: vec![CAPABILITY.into(), "S-1-5-5-0-12345".into(), "S-1-1-0".into()],
            integrity: LOW_INTEGRITY_SID.into(),
        }
    }

    #[test]
    fn package_names_are_fresh_and_fit_the_derivation_limit() {
        let name = package_name([1, 0xdead_beef, 0, u32::MAX]);
        assert_eq!(name, "tau.sandbox.00000001deadbeef00000000ffffffff");
        assert!(name.len() <= 64);
        assert_ne!(package_name([1, 2, 3, 4]), package_name([1, 2, 3, 5]));
    }

    #[test]
    fn recognises_package_sids_only() {
        assert!(is_package_sid(PACKAGE));
        assert!(!is_package_sid("S-1-15-2-1"));
        assert!(!is_package_sid("S-1-15-2-2"));
        assert!(!is_package_sid("S-1-15-3-1024-1-2-3-4-5-6-7"));
        assert!(!is_package_sid("S-1-15-2-1-2-3-4-5-6"));
        assert!(!is_package_sid("S-1-15-2-1-2-3-4-5-6-4294967296"));
        assert!(!is_package_sid(CAPABILITY));
    }

    #[test]
    fn accepts_exactly_this_launchs_bare_appcontainer() {
        assert_eq!(verify_token(&facts(), PACKAGE, CAPABILITY), Ok(()));
        assert!(facts().describe().contains("appContainer=true package=S-1-15-2-"));
    }

    #[test]
    fn refuses_every_other_token() {
        type Change = fn(&mut TokenFacts);
        let cases: [(&str, Change); 6] = [
            ("not appcontainer", |f| f.app_container = false),
            ("no package", |f| f.package = None),
            ("other package", |f| f.package = Some("S-1-15-2-9-9-9-9-9-9-9".into())),
            ("capabilities", |f| f.capabilities = vec!["S-1-15-3-1".into()]),
            ("unrestricted", |f| f.restricted.clear()),
            ("medium", |f| f.integrity = "S-1-16-8192".into()),
        ];
        for (name, change) in cases {
            let mut token = facts();
            change(&mut token);
            assert!(verify_token(&token, PACKAGE, CAPABILITY).is_err(), "{name}");
        }
    }

    #[test]
    fn splits_the_sacl_at_top_level_only() {
        assert_eq!(split_sacl("O:BAG:SYD:(A;;FA;;;SY)"), ("O:BAG:SYD:(A;;FA;;;SY)", ""));
        assert_eq!(
            split_sacl("O:SYG:SYD:PAI(A;OICI;FA;;;SY)S:AI(ML;OICIID;NW;;;LW)"),
            ("O:SYG:SYD:PAI(A;OICI;FA;;;SY)", "S:AI(ML;OICIID;NW;;;LW)")
        );
        // An alias that ends in S right before the SACL tag, and a SID owner.
        assert_eq!(split_sacl("O:LSG:LSS:(ML;;NW;;;LW)"), ("O:LSG:LS", "S:(ML;;NW;;;LW)"));
        assert_eq!(
            split_sacl("O:S-1-5-21-1-2-3-500G:S-1-5-21-1-2-3-513D:"),
            ("O:S-1-5-21-1-2-3-500G:S-1-5-21-1-2-3-513D:", "")
        );
    }

    #[test]
    fn compares_restored_descriptors_by_dacl_and_label_aces() {
        let journaled = "O:S-1-5-21-1G:S-1-5-21-1D:AI(A;ID;FA;;;SY)";
        assert!(restored(journaled, journaled));
        // A label propagation can leave the SACL's auto-inherited flag behind with no ACE in it.
        assert!(restored("O:S-1-5-21-1G:S-1-5-21-1D:AI(A;ID;FA;;;SY)S:AI", journaled));
        assert!(!restored("O:S-1-5-21-1G:S-1-5-21-1D:AI(A;ID;FA;;;SY)S:AI(ML;ID;NW;;;LW)", journaled));
        assert!(!restored("O:S-1-5-21-1G:S-1-5-21-1D:PAI(A;ID;FA;;;SY)", journaled));
        let labelled = "O:BAG:SYD:(A;;FA;;;SY)S:(ML;OICI;NW;;;LW)";
        assert!(restored("O:BAG:SYD:(A;;FA;;;SY)S:P(ML;OICI;NW;;;LW)", labelled));
        assert!(!restored("O:BAG:SYD:(A;;FA;;;SY)S:(ML;OICI;NW;;;ME)", labelled));
        assert_eq!(label_aces("S:AI(ML;OICIID;NW;;;LW)"), ["(ML;OICIID;NW;;;LW)"]);
    }
}
