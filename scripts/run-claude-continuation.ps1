[CmdletBinding()]
param(
    [string]$TaskName = "JPLearn-ClaudeCode-Continuation",
    [int]$TimeoutMinutes = 120
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$workspace = "D:\Project\Web\JPLearn"
$expectedBranch = "codex/vocabulary-feature"
$claudePath = Join-Path $HOME ".local\bin\claude.exe"
$automationDir = Join-Path $workspace ".codex\automation"
$promptPath = Join-Path $automationDir "continuation-prompt.md"
$logsDir = Join-Path $automationDir "logs"
$lockPath = Join-Path $automationDir "continuation.lock"
$statusPath = Join-Path $automationDir "continuation.status.json"
$startedAt = Get-Date
$stamp = $startedAt.ToString("yyyyMMdd-HHmmss")
$stdoutPath = Join-Path $logsDir "claude-continuation-$stamp.jsonl"
$stderrPath = Join-Path $logsDir "claude-continuation-$stamp.stderr.log"

New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

$lockStream = $null
$process = $null
$timedOut = $false
$exitCode = $null
$failure = $null

try {
    $lockStream = [System.IO.File]::Open(
        $lockPath,
        [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write,
        [System.IO.FileShare]::None
    )

    $lockText = [System.Text.Encoding]::UTF8.GetBytes(
        "pid=$PID`nstartedAt=$($startedAt.ToString('o'))`n"
    )
    $lockStream.Write($lockText, 0, $lockText.Length)
    $lockStream.Flush()

    if (-not (Test-Path -LiteralPath $workspace -PathType Container)) {
        throw "Workspace not found: $workspace"
    }
    if (-not (Test-Path -LiteralPath $claudePath -PathType Leaf)) {
        throw "Claude Code executable not found: $claudePath"
    }
    if (-not (Test-Path -LiteralPath $promptPath -PathType Leaf)) {
        throw "Continuation prompt not found: $promptPath"
    }

    Push-Location $workspace
    try {
        $branch = (& git branch --show-current).Trim()
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to read the current Git branch."
        }
        if ($branch -ne $expectedBranch) {
            throw "Expected branch '$expectedBranch', found '$branch'."
        }

        $head = (& git rev-parse HEAD).Trim()
        $gitStatus = @(& git status --short)
        $prompt = Get-Content -LiteralPath $promptPath -Raw -Encoding UTF8

        [ordered]@{
            taskName = $TaskName
            state = "running"
            startedAt = $startedAt.ToString("o")
            workspace = $workspace
            branch = $branch
            head = $head
            dirtyPaths = $gitStatus
            stdoutPath = $stdoutPath
            stderrPath = $stderrPath
            timeoutMinutes = $TimeoutMinutes
        } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statusPath -Encoding UTF8

        $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
        $startInfo.FileName = $claudePath
        $startInfo.WorkingDirectory = $workspace
        $startInfo.Arguments = "--print --input-format text --effort high --permission-mode acceptEdits --output-format stream-json --verbose"
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        $startInfo.RedirectStandardInput = $true
        $startInfo.RedirectStandardOutput = $true
        $startInfo.RedirectStandardError = $true
        $startInfo.StandardOutputEncoding = [System.Text.Encoding]::UTF8
        $startInfo.StandardErrorEncoding = [System.Text.Encoding]::UTF8

        $process = [System.Diagnostics.Process]::new()
        $process.StartInfo = $startInfo

        if (-not $process.Start()) {
            throw "Claude Code failed to start."
        }

        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.Write($prompt)
        $process.StandardInput.Close()

        $completed = $process.WaitForExit($TimeoutMinutes * 60 * 1000)
        if (-not $completed) {
            $timedOut = $true
            & taskkill.exe /PID $process.Id /T /F | Out-Null
            $process.WaitForExit()
        }

        $stdoutTask.GetAwaiter().GetResult() |
            Set-Content -LiteralPath $stdoutPath -Encoding UTF8
        $stderrTask.GetAwaiter().GetResult() |
            Set-Content -LiteralPath $stderrPath -Encoding UTF8

        if (-not $timedOut) {
            $exitCode = $process.ExitCode
        }
    }
    finally {
        Pop-Location
    }
}
catch {
    $failure = $_.Exception.Message
    $failure | Set-Content -LiteralPath $stderrPath -Encoding UTF8
}
finally {
    if ($null -ne $process) {
        $process.Dispose()
    }
    if ($null -ne $lockStream) {
        $lockStream.Dispose()
    }
    Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue

    $finishedAt = Get-Date
    $state = if ($failure) {
        "failed"
    }
    elseif ($timedOut) {
        "timed_out"
    }
    elseif ($exitCode -eq 0) {
        "completed"
    }
    else {
        "failed"
    }

    [ordered]@{
        taskName = $TaskName
        state = $state
        startedAt = $startedAt.ToString("o")
        finishedAt = $finishedAt.ToString("o")
        durationMinutes = [Math]::Round(($finishedAt - $startedAt).TotalMinutes, 2)
        timedOut = $timedOut
        exitCode = $exitCode
        failure = $failure
        stdoutPath = $stdoutPath
        stderrPath = $stderrPath
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $statusPath -Encoding UTF8
}

if ($failure) {
    throw $failure
}
if ($timedOut) {
    throw "Claude Code exceeded the $TimeoutMinutes minute limit."
}
if ($exitCode -ne 0) {
    throw "Claude Code exited with code $exitCode."
}
