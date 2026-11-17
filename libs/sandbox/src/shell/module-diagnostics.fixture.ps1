# Read-only context for a Windows PowerShell 5.1 launch that cannot find Measure-Object (T02-ps51, T02-cache-ps51).
# The conformance suite passes this file's text as the -Command of a sandboxed launch, and of one outside the sandbox,
# only after a pipeline failed. It prints why command discovery did or did not find Microsoft.PowerShell.Utility:
# the engine's Modules and CommandDiscovery trace for one lookup, the analysis cache's commands for each module file
# auto-discovery walks, then Get-Command, Get-Module -ListAvailable and Import-Module. It writes and deletes no file;
# the caller points PSModuleAnalysisCachePath at a read-only file or at a path under the shell's executable file, so
# PowerShell's own delayed cache write fails. It uses [Console] and .NET only, never Utility's cmdlets, which are the ones missing.
$ErrorActionPreference = 'Continue'
function say([string] $line) { [Console]::Out.WriteLine($line) }
say ('language ' + $ExecutionContext.SessionState.LanguageMode)
say ('version ' + $PSVersionTable.PSVersion)
say ('PSModulePath ' + $env:PSModulePath)
say ('PSModuleAnalysisCachePath ' + $env:PSModuleAnalysisCachePath + ' exists ' + [System.IO.File]::Exists([string] $env:PSModuleAnalysisCachePath))
say ('PSModuleAutoLoadingPreference ' + [string] $PSModuleAutoLoadingPreference)
say ('TEMP ' + $env:TEMP + ' exists ' + [System.IO.Directory]::Exists($env:TEMP))
$flags = [System.Reflection.BindingFlags]'NonPublic, Public, Static, Instance'
$engine = [System.Management.Automation.PSObject].Assembly
$trace = [System.IO.StringWriter]::new()
$listener = [System.Diagnostics.TextWriterTraceListener]::new($trace)
$sources = @()
foreach ($pair in @(@('System.Management.Automation.ModuleIntrinsics', 'Tracer'), @('System.Management.Automation.CommandDiscovery', 'discoveryTracer'))) {
  try {
    $source = $engine.GetType($pair[0]).GetField($pair[1], $flags).GetValue($null)
    $source.Options = [System.Management.Automation.PSTraceSourceOptions]'WriteLine, Error, Warning, Exception'
    try { $source.GetType().GetProperty('TraceSource', $flags).GetValue($source).Switch.Level = [System.Diagnostics.SourceLevels]::All } catch { say ('trace level ' + $_.Exception.Message) }
    $null = $source.Listeners.Add($listener)
    $sources += $source
  } catch { say ('trace ' + $pair[1] + ' ' + $_.Exception.Message) }
}
$started = [DateTime]::UtcNow
try {
  $found = $ExecutionContext.InvokeCommand.GetCommand('Measure-Object', [System.Management.Automation.CommandTypes]::Cmdlet)
  say ('lookup Measure-Object ' + [string]($null -ne $found) + ' ' + [string] $found.ModuleName + ' ' + [int]([DateTime]::UtcNow - $started).TotalMilliseconds + ' ms')
} catch { say ('lookup Measure-Object ' + $_.Exception.ToString()) }
foreach ($source in $sources) { $source.Options = [System.Management.Automation.PSTraceSourceOptions]'None'; $source.Listeners.Remove($listener) }
$listener.Flush()
$shown = 0
foreach ($line in ($trace.ToString() -split "`r?`n")) {
  if ($line -match 'xception|Utility|Found in|NULL|non module-qualified|skipp|out of date|rror|Caching') {
    if ($shown -lt 80) { say ('trace ' + $line) }
    $shown++
  }
}
say ('trace matching lines ' + $shown)
try {
  $context = $null
  foreach ($field in $ExecutionContext.GetType().GetFields($flags)) { if ($field.FieldType.FullName -eq 'System.Management.Automation.ExecutionContext') { $context = $field.GetValue($ExecutionContext) } }
  $enumerate = $null
  foreach ($method in $engine.GetType('System.Management.Automation.ModuleUtils').GetMethods($flags)) { if ($method.Name -eq 'GetDefaultAvailableModuleFiles' -and $method.GetParameters().Count -eq 3) { $enumerate = $method } }
  $analyse = $null
  foreach ($method in $engine.GetType('System.Management.Automation.AnalysisCache').GetMethods($flags)) { if ($method.Name -eq 'GetExportedCommands' -and $method.GetParameters().Count -eq 3) { $analyse = $method } }
  say ('walk ' + [string] $enumerate + ' / ' + [string] $analyse)
  $files = $enumerate.Invoke($null, [object[]] @($true, $true, $context))
  $cursor = [System.Collections.IEnumerable].GetMethod('GetEnumerator').Invoke($files, $null)
  $next = [System.Collections.IEnumerator].GetMethod('MoveNext')
  $current = [System.Collections.IEnumerator].GetProperty('Current')
  $count = 0; $none = 0
  while ($true) {
    try { if (-not $next.Invoke($cursor, $null)) { break } } catch { say ('walk enumeration ' + $_.Exception.ToString()); break }
    $file = [string] $current.GetValue($cursor, $null)
    $count++
    try {
      $commands = $analyse.Invoke($null, [object[]] @([System.IO.Path]::GetFullPath($file), $false, $context))
      if ($null -eq $commands) { $none++; say ('walk ' + $count + ' none ' + $file) }
      elseif ($file -match 'Microsoft\.PowerShell\.(Utility|Management)' -or $commands.ContainsKey('Measure-Object')) { say ('walk ' + $count + ' ' + $commands.Count + ' commands, Measure-Object ' + $commands.ContainsKey('Measure-Object') + ' ' + $file) }
    } catch { say ('walk ' + $count + ' ' + $file + ' ' + $_.Exception.ToString()) }
  }
  say ('walk modules ' + $count + ', without commands ' + $none)
} catch { say ('walk ' + $_.Exception.ToString()) }
$command = Get-Command Measure-Object -ErrorAction SilentlyContinue
say ('Get-Command Measure-Object ' + [string]($null -ne $command) + ' ' + [string] $command.ModuleName)
foreach ($module in (Get-Module -ListAvailable Microsoft.PowerShell.Utility)) { say ('available ' + $module.Version + ' exported ' + $module.ExportedCommands.Count + ' ' + $module.Path) }
foreach ($module in (Get-Module)) { say ('loaded ' + $module.Name) }
try { $assembly = [System.Reflection.Assembly]::Load('Microsoft.PowerShell.Commands.Utility, Version=3.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35'); say ('assembly ' + $assembly.Location) } catch { say ('assembly ' + $_.Exception.ToString()) }
try { Import-Module Microsoft.PowerShell.Utility -ErrorAction Stop; say 'import ok' } catch { say ('import ' + $_.FullyQualifiedErrorId + ' ' + $_.Exception.ToString()) }
$listed = 0
foreach ($entry in $Error) { if ($listed -lt 10) { say ('error ' + $entry.FullyQualifiedErrorId + ' ' + $entry.Exception.Message) }; $listed++ }
