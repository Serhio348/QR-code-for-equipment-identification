$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$russian = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'ru*' } | Select-Object -First 1
if (-not $russian) {
  Write-Output 'NO_RUSSIAN_VOICE'
  exit 0
}
$synth.SelectVoice($russian.VoiceInfo.Name)
$synth.Rate = -1
$dir = Join-Path $PSScriptRoot '..\public\voice'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$jsonPath = Join-Path $PSScriptRoot 'voice-lines.json'
$lines = Get-Content -Raw -Encoding UTF8 $jsonPath | ConvertFrom-Json
foreach ($prop in $lines.PSObject.Properties) {
  $path = Join-Path $dir ($prop.Name + '.wav')
  $synth.SetOutputToWaveFile($path)
  $synth.Speak([string]$prop.Value)
  $synth.SetOutputToNull()
}
Write-Output ('VOICE_OK ' + $russian.VoiceInfo.Name)
