# scripts/release.ps1
# Usage: pwsh -File scripts/release.ps1 -Version 0.7.6
# Must be run with Foundry VTT closed (LevelDB files must not be locked).

param([Parameter(Mandatory)][string]$Version)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# ── 1. Resolve gh CLI and extract GitHub token ────────────────────────────
$ghCmd = Get-Command gh -ErrorAction SilentlyContinue
$gh = if ($ghCmd) { $ghCmd.Source } else { "C:\Program Files\GitHub CLI\gh.exe" }
if (-not (Test-Path $gh)) { throw "gh CLI not found. Install it with: winget install GitHub.cli" }

$token = & $gh auth token 2>$null
if (-not $token) { throw "Not logged in to gh CLI. Run: gh auth login" }
$env:GH_TOKEN = $token

Write-Host "✓ GitHub token loaded" -ForegroundColor Green

# ── 2. Derive repo slug from git remote ──────────────────────────────────
$originUrl = git remote get-url origin
$repo = $originUrl -replace '.*github\.com[:/]', '' -replace '\.git$', ''

# ── 3. Rebuild packs from source ──────────────────────────────────────────
Write-Host "Building packs from source..." -ForegroundColor Cyan
node scripts/pack.js
Write-Host "✓ Packs built" -ForegroundColor Green

# ── 4. Update module.json ─────────────────────────────────────────────────
Write-Host "Updating module.json to version $Version..." -ForegroundColor Cyan
$manifest = Get-Content "module.json" -Raw | ConvertFrom-Json
$manifest.version = $Version
$manifest.download = "https://github.com/$repo/releases/download/$Version/stonetop.zip"
$manifest | ConvertTo-Json -Depth 20 | Set-Content "module.json" -Encoding utf8
Write-Host "✓ module.json updated" -ForegroundColor Green

# ── 5. Commit and push ────────────────────────────────────────────────────
Write-Host "Committing and pushing..." -ForegroundColor Cyan
git add module.json
git commit -m "[Release] Bump version to $Version"
$authUrl = $originUrl -replace 'https://', "https://x-access-token:$token@"
git push $authUrl main
Write-Host "✓ Pushed to GitHub" -ForegroundColor Green

# ── 6. Build the zip ──────────────────────────────────────────────────────
Write-Host "Building stonetop.zip..." -ForegroundColor Cyan
if (Test-Path "stonetop.zip") { Remove-Item "stonetop.zip" -Force }

$excludeTop = [System.Collections.Generic.HashSet[string]]@(
    'node_modules', '.git', '.claude', 'scripts', 'jsconfig.json',
    'package.json', 'package-lock.json', 'extracted_text.txt', 'output.txt',
    'Handout_-_Setting_Overview.pdf', 'stonetop_inserts.pdf', '.gitignore', 'README.md'
)

$rootLen = $root.Length + 1
$files = Get-ChildItem -Recurse -File | Where-Object {
    $rel = $_.FullName.Substring($rootLen)
    -not $excludeTop.Contains(($rel -split '\\', 2)[0]) -and
    $rel -notmatch '^packs\\(src|\.tmp)\\|stonetop\.zip$|\.pdf$|LOG\.old$|\\(LOCK|CURRENT|LOG)$|\\MANIFEST-'
}

Add-Type -Assembly System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open("$root\stonetop.zip", 'Create')
$files | ForEach-Object {
    $rel = $_.FullName.Substring($rootLen)
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, $_.FullName, "stonetop\$rel",
        [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
}
$zip.Dispose()
$sizeMB = [Math]::Round((Get-Item "stonetop.zip").Length / 1MB, 1)
Write-Host "✓ stonetop.zip built ($sizeMB MB)" -ForegroundColor Green

# ── 7. Create GitHub release and upload assets ────────────────────────────
Write-Host "Creating GitHub release $Version..." -ForegroundColor Cyan
& $gh release create $Version --repo $repo --title $Version --notes "Release $Version"

Write-Host "Uploading assets..." -ForegroundColor Cyan
& $gh release upload $Version "module.json" "stonetop.zip" --repo $repo

Write-Host ""
Write-Host "✓ Release $Version published!" -ForegroundColor Green
Write-Host "  Release: https://github.com/$repo/releases/tag/$Version"
Write-Host "  Install: https://github.com/$repo/releases/latest/download/module.json"
