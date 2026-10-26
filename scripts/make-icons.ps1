# Builds every icon and splash image the app config points at from ONE square source image.
#
#   powershell -ExecutionPolicy Bypass -File scripts/make-icons.ps1 [-Source path\to\art.png] [-Background '#007AFF']
#
# (-ExecutionPolicy Bypass applies to this one run only; it changes no setting on the machine.)
#
# Source: a square PNG, ideally 1024x1024, with its own background (no transparency - the App
# Store refuses icons with an alpha channel). Without -Source it uses assets/source/icon.png if
# that exists, else draws a plain "PL" placeholder so a test build never shows Expo's logo.
# Background: the color behind the Android adaptive icon and the splash screen; it must match
# android.adaptiveIcon.backgroundColor and the expo-splash-screen backgroundColor in app.json.
#
# Writes, in assets/images/:
#   icon.png                     1024x1024, opaque   (iOS, and the default everywhere)
#   android-icon-foreground.png  1024x1024, transparent, art at 72% in the middle - Android
#                                launchers crop the outer edge of an adaptive icon to a circle,
#                                squircle, or square, so the art must sit inside the safe zone
#   splash-icon.png              512x512 (shown centered on the splash background)
#   favicon.png                  48x48 (web build)
# Uses only Windows' built-in System.Drawing, so nothing needs installing.

param(
  [string]$Source = '',
  [string]$Background = '#007AFF'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'assets\images'
if (-not $Source) {
  $default = Join-Path $root 'assets\source\icon.png'
  if (Test-Path $default) { $Source = $default }
}
$bg = [System.Drawing.ColorTranslator]::FromHtml($Background)

function New-Canvas([int]$size, [bool]$opaque) {
  # Opaque images get no alpha channel at all: the App Store refuses an icon that has one, even
  # when every pixel is solid.
  $format = if ($opaque) { [System.Drawing.Imaging.PixelFormat]::Format24bppRgb } else { [System.Drawing.Imaging.PixelFormat]::Format32bppArgb }
  $bmp = New-Object System.Drawing.Bitmap($size, $size, $format)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  if ($opaque) { $g.Clear($bg) } else { $g.Clear([System.Drawing.Color]::Transparent) }
  return @($bmp, $g)
}

# The art, as a 1024x1024 bitmap: the source scaled to fit, or the placeholder.
function Get-Art {
  if ($Source) {
    $src = [System.Drawing.Image]::FromFile((Resolve-Path $Source))
    $bmp, $g = New-Canvas 1024 $true
    $g.DrawImage($src, 0, 0, 1024, 1024)
    $g.Dispose(); $src.Dispose()
    return $bmp
  }
  $bmp, $g = New-Canvas 1024 $true
  $font = New-Object System.Drawing.Font('Segoe UI', 400, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
  $g.DrawString('PL', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF(0, 20, 1024, 1024)), $fmt)
  $g.Dispose(); $font.Dispose()
  return $bmp
}

function Save-Scaled($art, [int]$size, [double]$fraction, [bool]$opaque, [string]$name) {
  $bmp, $g = New-Canvas $size $opaque
  $inner = [int]($size * $fraction)
  $offset = [int](($size - $inner) / 2)
  $g.DrawImage($art, $offset, $offset, $inner, $inner)
  $g.Dispose()
  $path = Join-Path $out $name
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "wrote $name ($size x $size)"
}

$art = Get-Art
Save-Scaled $art 1024 1.0 $true 'icon.png'
Save-Scaled $art 1024 0.72 $false 'android-icon-foreground.png'
Save-Scaled $art 512 1.0 $true 'splash-icon.png'
Save-Scaled $art 48 1.0 $true 'favicon.png'
$art.Dispose()
if (-not $Source) { Write-Output 'No source image given: wrote the "PL" placeholder.' }
