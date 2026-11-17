# Read-only context for a Windows PowerShell 5.1 launch that cannot find Measure-Object (T02-ps51, T02-cache-ps51).
# The conformance suite passes this file's text as the -Command of a sandboxed launch, and of one outside the sandbox,
# only after a pipeline failed. It prints why command discovery did or did not find Microsoft.PowerShell.Utility:
# the engine's Modules and CommandDiscovery trace for one lookup (matching lines and the last 40), whether each module
# folder on PSModulePath can be listed, the analysis cache's commands for each module file auto-discovery walks, then Get-Command, Get-Module -ListAvailable and Import-Module. It writes and deletes no file;
# the caller points PSModuleAnalysisCachePath at a read-only file or at a path under the shell's executable file, so
# PowerShell's own delayed cache write fails. It uses [Console] and .NET only, never Utility's cmdlets, which are the ones missing.
$ErrorActionPreference = 'Continue'
function say([string] $line) { [Console]::Out.WriteLine($line) }
# The exception a .NET call raised, without PowerShell's MethodInvocationException and reflection's wrapper.
function cause($record, [switch] $Full) {
  $exception = $record.Exception
  while ($null -ne $exception.InnerException -and ($exception -is [System.Management.Automation.MethodInvocationException] -or $exception -is [System.Reflection.TargetInvocationException])) { $exception = $exception.InnerException }
  if ($Full) { return $exception.ToString() }
  return $exception.GetType().FullName + ' ' + $exception.Message
}
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
$lines = $trace.ToString() -split "`r?`n"
$shown = 0
foreach ($line in $lines) {
  if ($line -match 'Exception|denied|Error|Utility|Management|Measure-Object|Returning NULL|stale|Found in') {
    if ($shown -lt 80) { say ('trace ' + $line) }
    $shown++
  }
}
say ('trace lines ' + $lines.Count + ', matching ' + $shown + ', last 40:')
$from = [Math]::Max(0, $lines.Count - 40)
for ($index = $from; $index -lt $lines.Count; $index++) { say ('trace tail ' + $lines[$index]) }
foreach ($root in ($env:PSModulePath -split ';')) {
  if ($root -eq '') { continue }
  try { $folders = [System.IO.Directory]::GetDirectories($root) } catch { say ('folder ' + $root + ' ' + (cause $_)); continue }
  say ('folder ' + $root + ' ' + $folders.Count + ' folders')
  foreach ($folder in $folders) {
    try { $manifests = [System.IO.Directory]::GetFiles($folder, '*.psd1', [System.IO.SearchOption]::TopDirectoryOnly); $children = [System.IO.Directory]::GetDirectories($folder); say ('folder ok ' + $manifests.Count + ' psd1, ' + $children.Count + ' dirs ' + $folder) }
    catch { say ('folder denied ' + $folder + ' ' + (cause $_)) }
  }
}
function engineType([string] $name) {
  try { $types = $engine.GetTypes() } catch { $types = $_.Exception.InnerException.Types }
  foreach ($type in $types) { if ($null -ne $type -and $type.Name -eq $name) { return $type } }
  say ('walk no type ' + $name)
}
try {
  $context = $null
  foreach ($field in $ExecutionContext.GetType().GetFields($flags)) { if ($field.FieldType.FullName -eq 'System.Management.Automation.ExecutionContext') { $context = $field.GetValue($ExecutionContext) } }
  $enumerate = $null
  foreach ($method in (engineType 'ModuleUtils').GetMethods($flags)) { if ($method.Name -eq 'GetDefaultAvailableModuleFiles' -and $method.GetParameters().Count -eq 3) { $enumerate = $method } }
  $analyse = $null
  foreach ($method in (engineType 'AnalysisCache').GetMethods($flags)) { if ($method.Name -eq 'GetExportedCommands' -and $method.GetParameters().Count -eq 3) { $analyse = $method } }
  say ('walk context ' + [string]($null -ne $context) + ', ' + [string] $enumerate + ', ' + [string] $analyse)
  $files = $enumerate.Invoke($null, [object[]] @($true, $true, $context))
  $cursor = [System.Collections.IEnumerable].GetMethod('GetEnumerator').Invoke($files, $null)
  $next = [System.Collections.IEnumerator].GetMethod('MoveNext')
  $current = [System.Collections.IEnumerator].GetProperty('Current')
  $count = 0; $none = 0
  while ($true) {
    try { if (-not $next.Invoke($cursor, $null)) { break } } catch { say ('walk enumeration stopped after ' + $count + ': ' + (cause $_ -Full)); break }
    $file = [string] $current.GetValue($cursor, $null)
    $count++
    try {
      $commands = $analyse.Invoke($null, [object[]] @([System.IO.Path]::GetFullPath($file), $false, $context))
      if ($null -eq $commands) { $none++; say ('walk ' + $count + ' none ' + $file) }
      else { say ('walk ' + $count + ' ' + $commands.Count + ' commands' + $(if ($commands.ContainsKey('Measure-Object')) { ', Measure-Object' } else { '' }) + ' ' + $file) }
    } catch { say ('walk ' + $count + ' ' + $file + ' ' + (cause $_ -Full)) }
  }
  say ('walk modules ' + $count + ', without commands ' + $none)
} catch { say ('walk ' + $_.Exception.ToString() + ' at ' + $_.InvocationInfo.PositionMessage) }
$command = Get-Command Measure-Object -ErrorAction SilentlyContinue
say ('Get-Command Measure-Object ' + [string]($null -ne $command) + ' ' + [string] $command.ModuleName)
foreach ($module in (Get-Module -ListAvailable Microsoft.PowerShell.Utility)) { say ('available ' + $module.Version + ' exported ' + $module.ExportedCommands.Count + ' ' + $module.Path) }
foreach ($module in (Get-Module)) { say ('loaded ' + $module.Name) }
try { $assembly = [System.Reflection.Assembly]::Load('Microsoft.PowerShell.Commands.Utility, Version=3.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35'); say ('assembly ' + $assembly.Location) } catch { say ('assembly ' + $_.Exception.ToString()) }
try { Import-Module Microsoft.PowerShell.Utility -ErrorAction Stop; say 'import ok' } catch { say ('import ' + $_.FullyQualifiedErrorId + ' ' + $_.Exception.ToString()) }
$listed = 0
foreach ($entry in $Error) { if ($listed -lt 10) { say ('error ' + $entry.FullyQualifiedErrorId + ' ' + $entry.Exception.Message) }; $listed++ }
