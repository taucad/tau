/**
 * PowerShell the Windows shell conformance suite runs outside the sandbox (`shell.conformance.windows.test.ts`).
 */

/**
 * PowerShell that writes `value` (an expression) to `path` (an expression) atomically: a sibling temporary file, then a
 * rename into place (`File.Replace` over an existing target, which never leaves it missing). `File.Move` and
 * `File.Replace` touch only the two paths; `Move-Item` inspects the destination's ancestors, which the AppContainer may
 * not read. A file the test polls while a shell writes it must never be seen half written.
 */
export const atomicWrite = (path: string, value: string): string =>
  `& { param($target, $text) $ErrorActionPreference = 'Stop'; $partial = $target + '.partial'; Set-Content -LiteralPath $partial -Value $text -NoNewline; if (Test-Path -LiteralPath $target) { [System.IO.File]::Replace($partial, $target, [NullString]::Value) } else { [System.IO.File]::Move($partial, $target) } } ${path} ${value}`;

/**
 * A22's named-pipe observer: it keeps four instances of `$env:CONFORMANCE_PIPE` listening (with Everyone granted full
 * control, or with no security descriptor when `$env:CONFORMANCE_PIPE_DACL` is `default`), writes the number of clients
 * it ever accepted to `$env:CONFORMANCE_PIPE_COUNT`, marks `$env:CONFORMANCE_PIPE_LISTENING` and stops once
 * `$env:CONFORMANCE_PIPE_STOP` exists.
 */
export const pipeObserverScript = [
  "$ErrorActionPreference = 'Stop'",
  '$security = [System.IO.Pipes.PipeSecurity]::new()',
  "$everyone = [System.Security.Principal.SecurityIdentifier]::new('S-1-1-0')",
  '$self = [System.Security.Principal.WindowsIdentity]::GetCurrent().User',
  "$security.AddAccessRule([System.IO.Pipes.PipeAccessRule]::new($everyone, 'FullControl', 'Allow'))",
  "$security.AddAccessRule([System.IO.Pipes.PipeAccessRule]::new($self, 'FullControl', 'Allow'))",
  'function New-Instance {',
  "  if ($env:CONFORMANCE_PIPE_DACL -eq 'default') {",
  "    [System.IO.Pipes.NamedPipeServerStream]::new($env:CONFORMANCE_PIPE, 'InOut', 4, 'Byte', 'Asynchronous')",
  '  } elseif ($PSVersionTable.PSVersion.Major -ge 6) {',
  "    [System.IO.Pipes.NamedPipeServerStreamAcl]::Create($env:CONFORMANCE_PIPE, 'InOut', 4, 'Byte', 'Asynchronous', 0, 0, $security)",
  '  } else {',
  "    [System.IO.Pipes.NamedPipeServerStream]::new($env:CONFORMANCE_PIPE, 'InOut', 4, 'Byte', 'Asynchronous', 0, 0, $security)",
  '  }',
  '}',
  '$servers = @(1..4 | ForEach-Object { New-Instance })',
  '$waits = @($servers | ForEach-Object { $_.WaitForConnectionAsync() })',
  '$accepted = 0',
  atomicWrite('$env:CONFORMANCE_PIPE_COUNT', "'0'"),
  'Set-Content -LiteralPath $env:CONFORMANCE_PIPE_LISTENING -Value 1 -NoNewline',
  'while (-not (Test-Path -LiteralPath $env:CONFORMANCE_PIPE_STOP)) {',
  '  for ($i = 0; $i -lt $servers.Count; $i++) {',
  '    if ($waits[$i].IsCompleted) {',
  "      if ($waits[$i].Status -eq 'RanToCompletion') {",
  '        $accepted++',
  `        ${atomicWrite('$env:CONFORMANCE_PIPE_COUNT', '"$accepted"')}`,
  '      }',
  '      $servers[$i].Dispose()',
  '      $servers[$i] = New-Instance',
  '      $waits[$i] = $servers[$i].WaitForConnectionAsync()',
  '    }',
  '  }',
  '  Start-Sleep -Milliseconds 20',
  '}',
].join('\n');
