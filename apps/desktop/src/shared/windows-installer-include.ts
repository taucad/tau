/**
 * The NSIS include the per-user Windows installer is built with (`scripts/package-windows.mts`): the `tau:` protocol
 * handler, and the uninstaller's removal of the Windows sandbox (operator decision 2026-11-27).
 *
 * The installer itself never elevates (`allowElevation: false`): the sandbox's one-time `setup` runs on the first shell,
 * Terminal or native-kernel use. A real uninstall, never the old uninstaller an update runs (`--updated`), runs the
 * bundled helper's `revoke` elevated (one administrator prompt) when the helper's install record exists, removing the
 * sandbox account, its profile and group, the firewall rules and WFP filters, the volume-root grants and the record
 * (`libs/sandbox/windows-sandbox/README.md`, Subcommands). It runs before the app's files are removed, so the helper is
 * still in place. A declined prompt leaves the sandbox in place and the uninstall continues.
 *
 * @module
 */

/** Where the helper's `setup` writes its install record, under `%ProgramData%` (README, Subcommands). */
const installRecord = String.raw`Tau\Sandbox\install.json`;

/** The bundled helper, relative to the installation directory (`windowsShellSandboxEnvironment`). */
const helper = String.raw`resources\windows-sandbox\win32-x64\tau-windows-sandbox.exe`;

/** An NSIS compile-time symbol reference, kept out of JavaScript's template syntax. */
const symbol = (name: string): string => ['$', '{', name, '}'].join('');

/**
 * The include's text.
 *
 * @param input - The protocol key under `HKCU` (`Software\Classes\tau` or `…\tau-staging`) and the product name.
 * @returns NSIS source defining `customInstall` and `customUnInstall`.
 */
export const windowsInstallerInclude = (input: Readonly<{ protocolKey: string; name: string }>): string =>
  [
    '!macro customInstall',
    `  WriteRegStr HKCU "${input.protocolKey}" "" "URL:${input.name}"`,
    `  WriteRegStr HKCU "${input.protocolKey}" "URL Protocol" ""`,
    String.raw`  WriteRegStr HKCU "${input.protocolKey}\shell\open\command" "" '"$INSTDIR\Tau.exe" "%1"'`,
    '!macroend',
    '!macro customUnInstall',
    '  Push $0',
    String.raw`  ReadRegStr $0 HKCU "${input.protocolKey}\shell\open\command" ""`,
    String.raw`  StrCmp $0 '"$INSTDIR\Tau.exe" "%1"' 0 +2`,
    `  DeleteRegKey HKCU "${input.protocolKey}"`,
    '  Pop $0',
    // An update runs the old uninstaller with `--updated`; the sandbox stays for the new version.
    `  ${symbol('ifNot')} ${symbol('isUpdated')}`,
    '    Push $1',
    '    ReadEnvStr $1 ProgramData',
    '    StrCmp $1 "" tau_sandbox_revoked',
    `    IfFileExists "$1\\${installRecord}" 0 tau_sandbox_revoked`,
    `    IfFileExists "$INSTDIR\\${helper}" 0 tau_sandbox_revoked`,
    `    ExecShellWait "runas" "$INSTDIR\\${helper}" "revoke" SW_HIDE`,
    '    ClearErrors',
    '    tau_sandbox_revoked:',
    '    Pop $1',
    `  ${symbol('endIf')}`,
    '!macroend',
    '',
  ].join('\n');
