$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
$previous = Get-Location
$stage = 'checking process environment JF_MIGRATION_DATABASE_URL'
try {
    Set-Location -LiteralPath $root
    if ([string]::IsNullOrWhiteSpace($env:JF_MIGRATION_DATABASE_URL)) {
        Write-Host '[credential availability] failed (code CREDENTIAL_MISSING): JF_MIGRATION_DATABASE_URL is absent or blank in this PowerShell process.'
        throw 'Set JF_MIGRATION_DATABASE_URL in this PowerShell process before running initialization.'
    }
    $stage = 'initializing and verifying database (see sanitized TypeScript output)'
    $node = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
    if ($null -eq $node) {
        Write-Host '[child-process execution] failed (code NODE_NOT_FOUND): node executable is unavailable on PATH.'
        throw 'Node unavailable.'
    }
    try {
        # Windows PowerShell treats redirected native stderr as ErrorRecords.
        # Capture it with Continue so the actual diagnostic survives Stop mode.
        $ErrorActionPreference = 'Continue'
        $childOutput = & $node.Source --import tsx scripts/phase6b/initialize.ts 2>&1
        $childExit = $LASTEXITCODE
    } catch {
        Write-Host ('[child-process execution] failed (code {0}): Node could not execute or report diagnostics; see child output above.' -f $_.Exception.HResult)
        throw 'Node execution failed.'
    } finally {
        $ErrorActionPreference = 'Stop'
    }
    $redactions = @($env:JF_MIGRATION_DATABASE_URL)
    try {
        $credentialUri = [Uri]$env:JF_MIGRATION_DATABASE_URL
        $encodedPassword = ($credentialUri.UserInfo -split ':', 2)[1]
        $redactions += $encodedPassword
        $redactions += [Uri]::UnescapeDataString($encodedPassword)
    } catch { } # URL parsing diagnostics belong to TypeScript; never echo the value.
    foreach ($line in $childOutput) {
        $safeLine = [string]$line
        foreach ($value in $redactions) {
            if (-not [string]::IsNullOrEmpty($value)) { $safeLine = $safeLine.Replace($value, '[REDACTED]') }
        }
        $safeLine = $safeLine -replace 'postgres(?:ql)?://[^\s"'']+', '[REDACTED URL]'
        Write-Host $safeLine
    }
    if ($childExit -ne 0) {
        Write-Host ("[initialization child process] failed (code EXIT_{0}): see the failing diagnostic stage above; no credential handoff performed." -f $childExit)
        throw 'Phase 6B stopped.'
    }
    $path = Join-Path $env:LOCALAPPDATA 'JobFray\phase6b-app-url.enc'
    $stage = 'opening protected application URL and completing clipboard handoff'
    Write-Host 'Verified application URL is stored in Windows DPAPI-protected storage:'
    Write-Host $path
    $secret = Get-Content -LiteralPath $path -Raw | ConvertTo-SecureString
    $url = [System.Net.NetworkCredential]::new('', $secret).Password
    try {
        Set-Clipboard -Value $url
        Write-Host 'Application URL copied. Paste into your approved secure destination; no Render change is authorized by this script.'
        Read-Host 'Press Enter when finished to clear this clipboard value' | Out-Null
    } finally {
        if ((Get-Clipboard -Raw) -ceq $url) { Set-Clipboard -Value '' }
        $url = $null
        $secret = $null
    }
} catch {
    Write-Error -Message "Phase 6B stopped while $stage. Resolve this failure before rerunning; do not reset, seed, or repair the remote database automatically." -ErrorAction Continue
    exit 1
} finally { Set-Location -LiteralPath $previous }
