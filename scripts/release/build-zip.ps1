# Build the release zip by hand.
#
# Compress-Archive on PowerShell 5.1 writes entry names with backslashes, which some
# extractors (and Foundry's installer) read as one long filename rather than a path.
# Writing entries explicitly with forward slashes avoids that entirely.
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Destination
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

if (Test-Path $Destination) { [System.IO.File]::Delete($Destination) }

$root = (Resolve-Path $Source).Path.TrimEnd('\')
$zip  = [System.IO.Compression.ZipFile]::Open($Destination, 'Create')
try {
  $files = Get-ChildItem -Path $root -Recurse -File -Force
  foreach ($f in $files) {
    $rel = $f.FullName.Substring($root.Length + 1) -replace '\\', '/'
    $entry = $zip.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
    $out = $entry.Open()
    try {
      $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
      $out.Write($bytes, 0, $bytes.Length)
    } finally { $out.Dispose() }
  }
  "entries written: $($files.Count)"
} finally { $zip.Dispose() }
