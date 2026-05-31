# scripts/release.ps1
# Usage: pwsh -File scripts/release.ps1 -Version 0.7.6
# Foundry VTT must be closed (LevelDB pack files must not be locked).

param([Parameter(Mandatory)][string]$Version)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# ── 1. gh CLI auth ────────────────────────────────────────────────────────
$ghCmd = Get-Command gh -ErrorAction SilentlyContinue
$gh = if ($ghCmd) { $ghCmd.Source } else { "C:\Program Files\GitHub CLI\gh.exe" }
if (-not (Test-Path $gh)) { throw "gh CLI not found. Install: winget install GitHub.cli" }

$token = & $gh auth token 2>$null
if (-not $token) { throw "Not logged in to gh CLI. Run: gh auth login" }
$env:GH_TOKEN = $token
Write-Host "gh auth OK" -ForegroundColor Green

# ── 2. Repo slug ──────────────────────────────────────────────────────────
$originUrl = git remote get-url origin
$repo = $originUrl -replace '.*github\.com[:/]', '' -replace '\.git$', ''

# ── 3. Refresh data/ exports from packs/src/ ──────────────────────────────
Write-Host "Refreshing data exports..." -ForegroundColor Cyan
node scripts/gen-data-exports.js
Write-Host "data/ exports refreshed" -ForegroundColor Green

# ── 4. Update module.json — UTF-8, no BOM ─────────────────────────────────
Write-Host "Updating module.json to v$Version..." -ForegroundColor Cyan
$manifest = Get-Content "module.json" -Raw | ConvertFrom-Json
$manifest.version = $Version
$manifest.download = "https://github.com/$repo/releases/download/$Version/stonetop.zip"
$json = $manifest | ConvertTo-Json -Depth 20
$noBomUtf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText("$root\module.json", $json, $noBomUtf8)
Write-Host "module.json updated" -ForegroundColor Green

# ── 5. Commit and push ────────────────────────────────────────────────────
Write-Host "Committing and pushing..." -ForegroundColor Cyan
git add module.json data/
git commit -m "[Release] v$Version"
$authUrl = $originUrl -replace 'https://', "https://x-access-token:$token@"
git push $authUrl main
Write-Host "Pushed to GitHub" -ForegroundColor Green

# ── 6. Build stonetop.zip ─────────────────────────────────────────────────
Write-Host "Building stonetop.zip..." -ForegroundColor Cyan
$zipPath = "$root\stonetop.zip"

$excludeTop = [System.Collections.Generic.HashSet[string]]@(
    'node_modules', '.git', '.claude', '.github', 'scripts', 'tests',
    'jsconfig.json', 'vitest.config.js', '.editorconfig',
    'package.json', 'package-lock.json',
    'extracted_text.txt', 'output.txt', 'sample-data.md', 'TODO.md',
    'Handout_-_Setting_Overview.pdf', 'stonetop_inserts.pdf',
    '.gitignore', 'README.md'
)

$rootLen = $root.Length + 1
$files = Get-ChildItem $root -Recurse -File | Where-Object {
    $rel = $_.FullName.Substring($rootLen)
    -not $excludeTop.Contains(($rel -split '\\', 2)[0]) -and
    $rel -notmatch '^packs\\(src|\.tmp)\\|stonetop\.zip$|\.pdf$|LOG\.old$|\\(LOCK|CURRENT|LOG)$|\\MANIFEST-'
}

if ([System.IO.File]::Exists($zipPath)) { [System.IO.File]::Delete($zipPath) }
Add-Type -Assembly System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
$files | ForEach-Object {
    $rel = $_.FullName.Substring($rootLen)
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, $_.FullName, "stonetop\$rel",
        [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
}
$zip.Dispose()
$sizeMB = [Math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "stonetop.zip built ($sizeMB MB)" -ForegroundColor Green

# ── 7. Publish GitHub release ─────────────────────────────────────────────
Write-Host "Publishing GitHub release v$Version..." -ForegroundColor Cyan

# Clean up any existing release/tag for this version so we can start fresh
& $gh release delete $Version --repo $repo --yes 2>$null
git tag -d $Version 2>$null
git push origin ":refs/tags/$Version" 2>$null

& $gh release create $Version --repo $repo --title "v$Version" --draft --notes "Draft — release notes pending"
& $gh release upload $Version "module.json" "stonetop.zip" --repo $repo

Write-Host ""
Write-Host "Release v$Version drafted!" -ForegroundColor Green
Write-Host "  https://github.com/$repo/releases/tag/$Version"
