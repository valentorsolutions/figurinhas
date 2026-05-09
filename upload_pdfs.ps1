$SUPABASE_URL  = "https://bnmarcfzarqdbjacpslj.supabase.co"
$SERVICE_KEY   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubWFyY2Z6YXJxZGJqYWNwc2xqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODMwODcyMSwiZXhwIjoyMDkzODg0NzIxfQ.umAmCbuvPJOwQUbSYFzFvPaRhM-G4zegoCmvdB2p9y8"

$baseHeaders = @{
    "apikey"        = $SERVICE_KEY
    "Authorization" = "Bearer $SERVICE_KEY"
}

# ── 1. Criar buckets ───────────────────────────────────────────
Write-Host "Criando buckets..." -ForegroundColor Cyan

$bucketsBody = @(
    @{ id = "selecoes"; name = "selecoes"; public = $false; file_size_limit = 10485760; allowed_mime_types = @("application/pdf") }
    @{ id = "especiais"; name = "especiais"; public = $false; file_size_limit = 20971520; allowed_mime_types = @("application/pdf") }
)

foreach ($b in $bucketsBody) {
    $body = $b | ConvertTo-Json
    try {
        $null = Invoke-RestMethod -Uri "$SUPABASE_URL/storage/v1/bucket" `
            -Method Post -Headers ($baseHeaders + @{ "Content-Type" = "application/json" }) `
            -Body $body
        Write-Host "  Bucket '$($b.id)' criado." -ForegroundColor Green
    } catch {
        $msg = $_.Exception.Message
        if ($msg -like "*already exists*" -or $msg -like "*Duplicate*" -or $msg -like "*409*") {
            Write-Host "  Bucket '$($b.id)' ja existe." -ForegroundColor Yellow
        } else {
            Write-Host "  Bucket '$($b.id)' ERRO: $msg" -ForegroundColor Red
        }
    }
}

# ── 2. Upload dos PDFs ─────────────────────────────────────────
$folder = Get-ChildItem "C:\Users\NEGO\Desktop\Copa" -Directory | Where-Object { $_.Name -like "Sele*" } | Select-Object -First 1
$SELECOES_FOLDER = $folder.FullName
Write-Host "`nPasta: $SELECOES_FOLDER"

$pdfs  = Get-ChildItem -Path $SELECOES_FOLDER -Filter "*.pdf"
$total = $pdfs.Count
Write-Host "PDFs encontrados: $total"
Write-Host ""

$ok    = 0
$erros = 0
$i     = 0

foreach ($f in $pdfs) {
    $i++
    $fileName = $f.Name

    if ($fileName -eq "00_Especiais.pdf") {
        $bucket = "especiais"
    } else {
        $bucket = "selecoes"
    }

    $url = "$SUPABASE_URL/storage/v1/object/$bucket/$fileName"

    try {
        $fileBytes = [System.IO.File]::ReadAllBytes($f.FullName)
        $upHeaders = @{
            "apikey"        = $SERVICE_KEY
            "Authorization" = "Bearer $SERVICE_KEY"
            "Content-Type"  = "application/pdf"
            "x-upsert"      = "true"
        }
        $null = Invoke-RestMethod -Uri $url -Method Post -Headers $upHeaders -Body $fileBytes
        Write-Host "  [$i/$total] OK [$bucket]: $fileName" -ForegroundColor Green
        $ok++
    } catch {
        Write-Host "  [$i/$total] ERRO: $fileName - $($_.Exception.Message)" -ForegroundColor Red
        $erros++
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "RESULTADO: $ok uploads OK | $erros erros"   -ForegroundColor $(if ($erros -eq 0) { "Green" } else { "Yellow" })
Write-Host "============================================" -ForegroundColor Cyan
