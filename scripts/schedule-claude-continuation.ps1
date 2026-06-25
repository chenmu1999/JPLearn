[CmdletBinding()]
param(
    [double]$DelayHours = 3.5,
    [string]$TaskName = "JPLearn-ClaudeCode-Continuation",
    [switch]$Replace
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$workspace = "D:\Project\Web\JPLearn"
$runnerPath = Join-Path $workspace "scripts\run-claude-continuation.ps1"
$powerShellPath = (Get-Command powershell.exe -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $runnerPath -PathType Leaf)) {
    throw "Runner script not found: $runnerPath"
}

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $existingTask) {
    if (-not $Replace) {
        throw "Scheduled task '$TaskName' already exists. Use -Replace to recreate it."
    }
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$runAt = (Get-Date).AddHours($DelayHours)
$endBoundary = $runAt.AddHours(3)
$taskUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$escapedRunner = $runnerPath.Replace('"', '""')
$escapedTaskName = $TaskName.Replace('"', '""')
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$escapedRunner`" -TaskName `"$escapedTaskName`" -TimeoutMinutes 120"

$action = New-ScheduledTaskAction `
    -Execute $powerShellPath `
    -Argument $arguments `
    -WorkingDirectory $workspace

$trigger = New-ScheduledTaskTrigger -Once -At $runAt
$trigger.EndBoundary = $endBoundary.ToString("s")

$principal = New-ScheduledTaskPrincipal `
    -UserId $taskUser `
    -LogonType Interactive `
    -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -DeleteExpiredTaskAfter (New-TimeSpan -Days 1) `
    -MultipleInstances IgnoreNew

$task = New-ScheduledTask `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Continue JPLearn vocabulary implementation with Claude Code after auditing repository progress."

Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null

$registered = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName

[ordered]@{
    taskName = $TaskName
    state = $registered.State.ToString()
    runAt = $runAt.ToString("o")
    nextRunTime = $info.NextRunTime.ToString("o")
    runner = $runnerPath
    user = $taskUser
} | ConvertTo-Json
