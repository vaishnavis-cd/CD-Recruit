param (
    [int]$CandidateCount = 1000,
    [string]$Department = "SOFTWARE_ENGINEERING",
    [string]$Category = "EXPERIENCED",
    [string]$RequisitionRef = "REQ-$(Get-Random -Minimum 100000 -Maximum 999999)",
    [string]$DriveName = "Enterprise Partner Sprint",
    [string]$ApiUrl = "http://localhost:3001/api/v1",
    [string]$ApiKey = ""
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "🚀 PARTNER API POWERSHELL RUNNER: $CandidateCount CANDIDATES" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Resolve API Key if not provided
if (-not $ApiKey) {
    Write-Host "🔑 Resolving Partner API Key..." -ForegroundColor Yellow
    $rawOut = (npx tsx scripts/create-test-key.ts | Out-String)
    if ($rawOut -match "pk_live_[a-f0-9]+") {
        $ApiKey = $Matches[0]
    } else {
        $ApiKey = "pk_live_loadtest_a9887fa59f145588a01469f49973713e"
    }
    Write-Host "   Active X-API-Key: $ApiKey" -ForegroundColor Gray
}

# 2. Generate Candidate Dataset
Write-Host ""
Write-Host "📦 Generating $CandidateCount candidate records across experience tiers..." -ForegroundColor Yellow
$tiers = @("0-1", "2-5", "6-10", "11-15")
$candidatesList = [System.Collections.Generic.List[object]]::new()
$runTag = (Get-Date).ToString("MMdd_HHmmss")

for ($i = 1; $i -le $CandidateCount; $i++) {
    $tier = $tiers[($i - 1) % $tiers.Length]
    $candidatesList.Add(@{
        name = "Candidate $i"
        email = "cand_${runTag}_${i}@partner-ingest.org"
        level = $tier
        external_candidate_ref = "ats-ext-${runTag}-${i}"
        phone = "+1555" + $i.ToString("D7")
    })
}

$payloadObj = @{
    department_code = $Department
    category = $Category
    requisition_ref = $RequisitionRef
    drive_name = "$DriveName ($runTag)"
    candidates = $candidatesList
}

$jsonBody = $payloadObj | ConvertTo-Json -Depth 10 -Compress
$payloadSizeKb = [Math]::Round(([System.Text.Encoding]::UTF8.GetByteCount($jsonBody) / 1024), 2)

Write-Host "   Candidate Count: $CandidateCount" -ForegroundColor Gray
Write-Host "   Payload Size:    $payloadSizeKb KB" -ForegroundColor Gray
Write-Host "   Requisition Ref: $RequisitionRef" -ForegroundColor Gray
Write-Host "   Department:      $Department" -ForegroundColor Gray

# 3. Dispatch HTTP POST request
Write-Host ""
Write-Host "⚡ Sending POST $ApiUrl/partner/candidates..." -ForegroundColor Yellow

$headers = @{
    "Content-Type"    = "application/json"
    "X-API-Key"       = $ApiKey
    "Idempotency-Key" = "idemp-$RequisitionRef"
}

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$response = Invoke-RestMethod -Uri "$ApiUrl/partner/candidates" -Method Post -Headers $headers -Body $jsonBody
$stopwatch.Stop()

$elapsedMs = $stopwatch.ElapsedMilliseconds
$elapsedSec = [Math]::Round(($elapsedMs / 1000), 3)
$throughput = [Math]::Round(($CandidateCount / ($elapsedMs / 1000)), 0)

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Green
Write-Host "🎉 SUCCESS: Ingested $CandidateCount Candidates in $elapsedSec seconds!" -ForegroundColor Green
Write-Host "================================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "📊 INGESTION METRICS:" -ForegroundColor Cyan
Write-Host "   Drive ID:              $($response.drive_id)"
Write-Host "   Invites Generated:     $($response.invites.Count) assessment links"
Write-Host "   Total Execution Time:  $elapsedMs ms ($elapsedSec s)"
Write-Host "   Throughput:            $throughput candidates / second"
Write-Host ""
Write-Host "🖥️  DASHBOARD REFLECTION:" -ForegroundColor Cyan
Write-Host "   View in Admin Web:     http://localhost:5173/drives/$($response.drive_id)" -ForegroundColor Yellow
Write-Host "   All Drives List:       http://localhost:5173/drives" -ForegroundColor Yellow
Write-Host ""
Write-Host "🔗 SAMPLE GENERATED ASSESSMENT LINKS:" -ForegroundColor Cyan
$sampleCount = [Math]::Min(5, $response.invites.Count)
for ($k = 0; $k -lt $sampleCount; $k++) {
    $inv = $response.invites[$k]
    Write-Host "   [$($k + 1)] $($inv.candidate_name) ($($inv.candidate_email))" -ForegroundColor White
    Write-Host "       Tier: $($inv.level_label) | Expires: $($inv.expires_at)" -ForegroundColor Gray
    Write-Host "       Link: $($inv.assessment_link)" -ForegroundColor Green
}
Write-Host ""
