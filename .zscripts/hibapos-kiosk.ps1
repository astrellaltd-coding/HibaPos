# HibaPOS France -- kiosk launcher (C-07, Batch 1.4)
#
# Task Scheduler runs this AT LOG ON, not at startup, and that split is not an
# oversight: a browser needs a desktop session, so it physically cannot start
# before someone is signed in. The SERVER starts at boot without anyone
# (`hibapos-server.ps1`), which is what makes the till survive a power cut when
# the staff on shift do not know the Windows password.
#
# WHAT THE OPERATOR SEES. The caisse opens in its own window -- no address bar,
# no tabs, no browser UI -- filling the screen. `--app=` gives that in ANY
# Chromium browser whether or not the site has been installed as a PWA, so
# nothing here depends on the install having been done. If it HAS been
# installed, the window carries the app's own icon as well.
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

# BRAVE FIRST, THEN EDGE -- the operator's choice, 2026-09-17. The France till
# rendered the login screen wrong in the browser that shipped on it and
# correctly in Brave, so Brave is what the restaurant will actually use.
#
# EDGE IS KEPT AS A FALLBACK RATHER THAN REPLACED. It is present on every
# Windows install, and a till whose Brave has been uninstalled or broken by an
# update should still open the caisse rather than drop to a bare desktop.
# Both are Chromium, so the argument list below is identical for either.
#
# BRAVE IS PROBED IN ITS PER-USER LOCATION TOO, and that line is load-bearing:
# Brave's installer writes to %LOCALAPPDATA% unless it is run elevated, so a
# ProgramFiles-only probe misses the common case. The cost of missing it is
# silent -- the script falls through to the default browser and the till opens
# with an address bar, tabs, and no fullscreen, which looks like a different
# bug entirely.
$browser = @(
    "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
    "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
    "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $browser) {
    Write-Warning "Ni Brave ni Edge n'ont ete trouves -- ouverture avec le navigateur par defaut."
    Write-Warning "  La fenetre n'aura ni le mode application ni le plein ecran."
    Start-Process $Url
    exit 0
}

Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Navigateur : $browser"

# --kiosk: TRUE fullscreen, no browser UI, no taskbar. The operator's choice,
# 2026-09-17, taken after the alternative was tried on the till and did not work.
#
# WHAT WAS HERE BEFORE, AND WHY IT WENT. The pair was `--app=$Url` plus
# `--start-fullscreen`, chosen so the operator could still reach the taskbar.
# MEASURED on the France till at 03:36: Brave opened a chromeless window that was
# NOT fullscreen. `--start-fullscreen` is ignored in --app mode -- it applies to
# a normal browser window -- so that combination never delivered the fullscreen
# its own comment claimed. The comment described an intention, not a behaviour,
# and nothing had ever run it to find out.
#
# --kiosk was then verified on the till BEFORE this was written: same browser,
# same URL, fullscreen with no chrome.
#
# WHAT IT COSTS. The taskbar is unreachable while the caisse is open. Alt+F4
# closes it. Receipts reach the thermal printer from inside the application, not
# through the browser, so the taskbar is not on the path of anything the staff do
# during service.
#
# --app= is DROPPED rather than combined with --kiosk: kiosk mode has no browser
# UI to remove, so it would add nothing.
$arguments = @(
    "--kiosk"
    $Url
    "--no-first-run"
    "--no-default-browser-check"
    "--disable-features=TranslateUI"
)

Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Launching HibaPOS."
Start-Process -FilePath $browser -ArgumentList $arguments
