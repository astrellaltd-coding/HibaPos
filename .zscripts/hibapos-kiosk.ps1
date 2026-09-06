# HibaPOS France -- kiosk launcher (C-07, Batch 1.4)
#
# Task Scheduler runs this AT LOG ON, not at startup, and that split is not an
# oversight: a browser needs a desktop session, so it physically cannot start
# before someone is signed in. The SERVER starts at boot without anyone
# (`hibapos-server.ps1`), which is what makes the till survive a power cut when
# the staff on shift do not know the Windows password.
#
# WHAT THE OPERATOR SEES. If the app has been installed as a PWA (Edge ->
# "Install HibaPOS"), this launches the installed app: its own window, its own
# icon, no address bar, no tabs. If it has not, it falls back to Edge's app
# mode, which looks the same but is not pinnable. Either way there is no
# browser UI on screen.
#
# Exit with Alt+F4. Kiosk mode is a convenience for the operator, not a security
# boundary -- anyone at the machine has the machine.

$ErrorActionPreference = "Stop"

$Url = "http://localhost:3000"
$TimeoutSeconds = 90

Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Waiting for HibaPOS to answer on $Url ..."

# Wait for the server the boot task started. Without this the browser opens on
# a connection-refused page and the operator sees a browser error as the first
# thing on the till -- which is exactly the impression this batch exists to
# remove. `/api` is the liveness probe (Batch 3.4) and needs no session.
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$ready = $false
while ((Get-Date) -lt $deadline) {
    try {
        $r = Invoke-WebRequest -Uri "$Url/api" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {
        Start-Sleep -Seconds 2
    }
}

if (-not $ready) {
    Write-Warning "HibaPOS n'a pas repondu en $TimeoutSeconds s. Consultez le journal du serveur."
    Write-Warning "  <dossier de donnees>\logs\server.log"
    # Open anyway: a visible browser error the operator can photograph beats a
    # blank desktop with no explanation.
}

$edge = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $edge) {
    Write-Warning "Microsoft Edge introuvable -- ouverture avec le navigateur par defaut."
    Start-Process $Url
    exit 0
}

# --app= gives a chromeless window; --start-fullscreen fills the screen without
# the hard lock of --kiosk, so the operator can still reach the taskbar to
# print, open a folder, or shut down. Full --kiosk is one flag away if the
# owner wants the machine locked to the till and nothing else.
$arguments = @(
    "--app=$Url"
    "--start-fullscreen"
    "--no-first-run"
    "--no-default-browser-check"
    "--disable-features=TranslateUI"
)

Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Launching HibaPOS."
Start-Process -FilePath $edge -ArgumentList $arguments
