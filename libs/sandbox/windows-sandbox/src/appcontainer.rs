//! The shell's per-launch AppContainer, as plain data: the package name and SID shapes, what the shell's
//! token must look like, and the SDDL comparison the ACL restore uses once a launch has set a mandatory
//! label. Everything here is portable and unit-tested on any host; the Win32 side is `win/lowbox.rs`.

/// The prefix of every per-launch AppContainer name. The rest is 128 random bits in hex, so no two launches
/// (concurrent or later) ever share a package SID, and with it any grant.
pub const PACKAGE_NAME_PREFIX: &str = "tau.sandbox.";

/// The one capability every launch's AppContainer carries. `setup` grants its SID (derived from this name with
/// `DeriveCapabilitySidsFromName`) on each fixed volume's root folder, this folder only, so PowerShell's
/// FileSystem provider can resolve `C:\`: a root's default DACL admits no AppContainer, and without it
/// `Start-Job` failed with "Cannot find path 'C:\'" (WIN-X64 run 44020877855). The same pattern as Chromium's
/// installer granting its `lpacChromeInstallFiles` capability on its own folder.
pub const VOLUME_CAPABILITY_NAME: &str = "tauSandboxVolumeRoot";

/// What the volume capability gets on a root, this folder only: `FILE_LIST_DIRECTORY | FILE_TRAVERSE |
/// FILE_READ_ATTRIBUTES | READ_CONTROL | SYNCHRONIZE`. Listing is included because the provider resolves a path's
/// case by enumerating each parent folder, the root among them; attributes alone would make `Test-Path C:\` true
/// and still fail every path below it.
pub const VOLUME_ROOT_ACCESS: u32 = 0x0012_00A1;

/// `S-1-16-4096`: the Low mandatory level every AppContainer token carries.
pub const LOW_INTEGRITY_SID: &str = "S-1-16-4096";

/// A fresh AppContainer name (`tau.sandbox.<32 hex digits>`, 44 characters: within the 64 that
/// `DeriveAppContainerSidFromAppContainerName` accepts).
pub fn package_name(random: [u32; 4]) -> String {
    let [a, b, c, d] = random;
    format!("{PACKAGE_NAME_PREFIX}{a:08x}{b:08x}{c:08x}{d:08x}")
}

/// Whether `name` is a per-launch AppContainer name as [`package_name`] makes it: the prefix and exactly 32
/// lowercase hex digits. The runner registers and the sweep deletes nothing else.
pub fn is_package_name(name: &str) -> bool {
    name.strip_prefix(PACKAGE_NAME_PREFIX)
        .is_some_and(|rest| rest.len() == 32 && rest.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)))
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

/// The shell's token must be an AppContainer token for exactly this launch's package, with exactly the
/// `capabilities` given (the volume capability) and no other, still write-restricted by this launch's
/// capability SID, at Low integrity. Anything else is refused before the shell's first instruction runs.
pub fn verify_token(facts: &TokenFacts, package: &str, capability: &str, capabilities: &[&str]) -> Result<(), String> {
    if !facts.app_container {
        return Err("the shell's token is not an AppContainer token".to_owned());
    }
    match facts.package.as_deref() {
        Some(actual) if actual.eq_ignore_ascii_case(package) => {}
        Some(actual) => return Err(format!("the shell's package SID is {actual}, not this launch's {package}")),
        None => return Err("the shell's token names no package SID".to_owned()),
    }
    let mut actual: Vec<String> = facts.capabilities.iter().map(|sid| sid.to_uppercase()).collect();
    let mut expected: Vec<String> = capabilities.iter().map(|sid| sid.to_uppercase()).collect();
    actual.sort();
    expected.sort();
    if actual != expected {
        return Err(format!(
            "the shell's token carries capabilities [{}], not exactly [{}]",
            facts.capabilities.join(","),
            capabilities.join(",")
        ));
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

/// A DACL in SDDL (`D:<flags>(ace)(ace)…`, as `ConvertSecurityDescriptorToStringSecurityDescriptorW` writes it
/// for `DACL_SECURITY_INFORMATION`) as its `D:<flags>` prefix and its ACE strings, parentheses included. `None`
/// when it is not one.
pub fn dacl_aces(dacl: &str) -> Option<(&str, Vec<&str>)> {
    if !dacl.starts_with("D:") {
        return None;
    }
    let start = dacl.find('(').unwrap_or(dacl.len());
    let (prefix, mut rest) = dacl.split_at(start);
    if prefix[2..].contains([')', ':']) {
        return None;
    }
    let mut aces = Vec::new();
    while !rest.is_empty() {
        if !rest.starts_with('(') {
            return None;
        }
        let mut depth = 0usize;
        let mut end = None;
        for (i, c) in rest.char_indices() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        end = Some(i);
                        break;
                    }
                }
                _ => {}
            }
        }
        let end = end?;
        aces.push(&rest[..=end]);
        rest = &rest[end + 1..];
    }
    Some((prefix, aces))
}

/// The ACE's field `index` (`type;flags;rights;object;inherited object;SID`), split at top level.
fn ace_field(ace: &str, index: usize) -> Option<&str> {
    ace.strip_prefix('(')?.strip_suffix(')')?.split(';').nth(index)
}

/// `dacl` without any ACE for `sid`. `None` when `dacl` does not parse.
pub fn dacl_without(dacl: &str, sid: &str) -> Option<String> {
    let (prefix, aces) = dacl_aces(dacl)?;
    let kept: String = aces
        .into_iter()
        .filter(|ace| !ace_field(ace, 5).is_some_and(|field| field.eq_ignore_ascii_case(sid)))
        .collect();
    Some(format!("{prefix}{kept}"))
}

/// `dacl` with exactly one access-allowed ACE for `sid` (`mask`, no inheritance: this folder only) in place of
/// any it had, after the explicit ACEs and before the inherited ones, so the DACL stays in canonical order.
pub fn dacl_with_root_grant(dacl: &str, sid: &str, mask: u32) -> Option<String> {
    let cleaned = dacl_without(dacl, sid)?;
    let (prefix, aces) = dacl_aces(&cleaned)?;
    let grant = format!("(A;;0x{mask:x};;;{sid})");
    let at =
        aces.iter().position(|ace| ace_field(ace, 1).is_some_and(|flags| flags.contains("ID"))).unwrap_or(aces.len());
    let mut out = prefix.to_owned();
    for (i, ace) in aces.iter().enumerate() {
        if i == at {
            out.push_str(&grant);
        }
        out.push_str(ace);
    }
    if at == aces.len() {
        out.push_str(&grant);
    }
    Some(out)
}

/// Whether `dacl` holds exactly the root grant [`dacl_with_root_grant`] writes for `sid`.
pub fn dacl_has_root_grant(dacl: &str, sid: &str, mask: u32) -> bool {
    dacl_aces(dacl).is_some_and(|(_, aces)| {
        let mine: Vec<&&str> =
            aces.iter().filter(|ace| ace_field(ace, 5).is_some_and(|field| field.eq_ignore_ascii_case(sid))).collect();
        mine.len() == 1
            && ace_field(mine[0], 0) == Some("A")
            && ace_field(mine[0], 1) == Some("")
            && ace_field(mine[0], 2).and_then(|rights| u32::from_str_radix(rights.trim_start_matches("0x"), 16).ok())
                == Some(mask)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const PACKAGE: &str = "S-1-15-2-1-2-3-4-5-6-4294967295";
    const CAPABILITY: &str = "S-1-5-21-11-22-33-44";
    const VOLUME: &str = "S-1-15-3-1024-1-2-3-4-5-6-7-8";

    #[test]
    fn grants_the_volume_capability_on_a_root_exactly_once_and_removes_it_exactly() {
        let root = "D:PAI(A;OICIIO;FA;;;CO)(A;;0x1301bf;;;AU)(A;OICI;FA;;;SY)(A;;0x1200a9;;;BU)";
        let granted = dacl_with_root_grant(root, VOLUME, VOLUME_ROOT_ACCESS).unwrap();
        assert_eq!(granted, format!("{root}(A;;0x1200a1;;;{VOLUME})"));
        assert!(dacl_has_root_grant(&granted, VOLUME, VOLUME_ROOT_ACCESS));
        assert!(!dacl_has_root_grant(root, VOLUME, VOLUME_ROOT_ACCESS));
        // Idempotent, and a stale or widened grant is replaced, not merged.
        assert_eq!(dacl_with_root_grant(&granted, VOLUME, VOLUME_ROOT_ACCESS).unwrap(), granted);
        let widened = format!("{root}(A;OICI;FA;;;{VOLUME})");
        assert_eq!(dacl_with_root_grant(&widened, VOLUME, VOLUME_ROOT_ACCESS).unwrap(), granted);
        assert!(!dacl_has_root_grant(&widened, VOLUME, VOLUME_ROOT_ACCESS));
        assert_eq!(dacl_without(&granted, &VOLUME.to_lowercase()).unwrap(), root);
        // Before the inherited ACEs, and a conditional ACE's nested parentheses survive.
        let inherited = "D:AI(D;;FA;;;S-1-5-21-1-2-3-4)(XA;;FR;;;WD;(Member_of {SID(BA)}))(A;ID;FA;;;SY)";
        assert_eq!(
            dacl_with_root_grant(inherited, VOLUME, VOLUME_ROOT_ACCESS).unwrap(),
            format!(
                "D:AI(D;;FA;;;S-1-5-21-1-2-3-4)(XA;;FR;;;WD;(Member_of {{SID(BA)}}))(A;;0x1200a1;;;{VOLUME})(A;ID;FA;;;SY)"
            )
        );
        for malformed in ["O:SYD:(A;;FA;;;SY)", "D:(A;;FA;;;SY", "D:(A;;FA;;;SY)x"] {
            assert_eq!(dacl_with_root_grant(malformed, VOLUME, VOLUME_ROOT_ACCESS), None, "{malformed}");
        }
        assert_eq!(
            dacl_with_root_grant("D:", VOLUME, VOLUME_ROOT_ACCESS).unwrap(),
            format!("D:(A;;0x1200a1;;;{VOLUME})")
        );
    }

    fn facts() -> TokenFacts {
        TokenFacts {
            user: "S-1-5-21-9-9-9-1001".into(),
            app_container: true,
            package: Some(PACKAGE.into()),
            capabilities: vec![VOLUME.into()],
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
    fn recognises_per_launch_package_names_only() {
        assert!(is_package_name(&package_name([1, 2, 3, u32::MAX])));
        for name in [
            "tau.sandbox.",
            "tau.sandbox.0000000100000002000000030000000",
            "tau.sandbox.000000010000000200000003ffffffff0",
            "tau.sandbox.000000010000000200000003FFFFFFFF",
            "tau.sandbox.000000010000000200000003fffffffg",
            "other.000000010000000200000003ffffffff",
            "Microsoft.WindowsCalculator_8wekyb3d8bbwe",
        ] {
            assert!(!is_package_name(name), "{name}");
        }
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
        assert_eq!(verify_token(&facts(), PACKAGE, CAPABILITY, &[VOLUME]), Ok(()));
        assert!(facts().describe().contains("appContainer=true package=S-1-15-2-"));
    }

    #[test]
    fn refuses_every_other_token() {
        type Change = fn(&mut TokenFacts);
        let cases: [(&str, Change); 8] = [
            ("not appcontainer", |f| f.app_container = false),
            ("no package", |f| f.package = None),
            ("other package", |f| f.package = Some("S-1-15-2-9-9-9-9-9-9-9".into())),
            ("no capability", |f| f.capabilities.clear()),
            ("another capability", |f| f.capabilities = vec!["S-1-15-3-1".into()]),
            ("an extra capability", |f| f.capabilities.push("S-1-15-3-1".into())),
            ("unrestricted", |f| f.restricted.clear()),
            ("medium", |f| f.integrity = "S-1-16-8192".into()),
        ];
        for (name, change) in cases {
            let mut token = facts();
            change(&mut token);
            assert!(verify_token(&token, PACKAGE, CAPABILITY, &[VOLUME]).is_err(), "{name}");
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
    fn reads_label_aces_inherited_or_not() {
        assert_eq!(label_aces("S:AI(ML;OICIID;NW;;;LW)"), ["(ML;OICIID;NW;;;LW)"]);
    }
}
