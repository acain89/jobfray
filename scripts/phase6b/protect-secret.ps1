$ErrorActionPreference = 'Stop'
try {
    if (-not [Console]::IsOutputRedirected) { throw 'Helper requires a private redirected output pipe.' }
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $candidate = $request.candidate
    $directory = Join-Path $env:LOCALAPPDATA 'JobFray'
    $path = Join-Path $directory 'phase6b-app-url.enc'
    if (Test-Path -LiteralPath $path) {
        $secret = Get-Content -LiteralPath $path -Raw | ConvertTo-SecureString
        $value = [System.Net.NetworkCredential]::new('', $secret).Password
    } else {
        if ($request.roleExists) { throw 'Existing role requires its previously protected credential; no password rotation is permitted.' }
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
        $secret = ConvertTo-SecureString -String $candidate -AsPlainText -Force
        $encrypted = ConvertFrom-SecureString -SecureString $secret
        # CreateNew avoids overwriting a credential from a simultaneous invocation.
        $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        try {
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($encrypted)
            $stream.Write($bytes, 0, $bytes.Length)
            $stream.Flush($true)
        } finally { $stream.Dispose() }
        $roundtrip = Get-Content -LiteralPath $path -Raw | ConvertTo-SecureString
        $value = [System.Net.NetworkCredential]::new('', $roundtrip).Password
        if ($value -cne $candidate) { throw 'Protected storage roundtrip failed.' }
    }
    # This helper is invoked ONLY with redirected stdout into the TypeScript process.
    [Console]::Out.Write($value)
} catch {
    [Console]::Error.WriteLine('Protected credential storage failed; details suppressed.')
    exit 1
} finally { $candidate = $null; $value = $null; $secret = $null; $roundtrip = $null }
