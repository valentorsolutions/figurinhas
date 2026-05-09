$key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubWFyY2Z6YXJxZGJqYWNwc2xqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODMwODcyMSwiZXhwIjoyMDkzODg0NzIxfQ.umAmCbuvPJOwQUbSYFzFvPaRhM-G4zegoCmvdB2p9y8"
$base = "https://bnmarcfzarqdbjacpslj.supabase.co/rest/v1"
$h = @{
    "apikey"        = $key
    "Authorization" = "Bearer $key"
}

$tables = @("selecoes", "pacotes", "especiais", "clientes", "pedidos", "cupons_desconto")

foreach ($t in $tables) {
    try {
        $r = Invoke-RestMethod -Uri "$base/$t`?select=id&limit=1" -Headers $h
        Write-Host "OK: tabela '$t' existe" -ForegroundColor Green
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        Write-Host "ERRO $code`: tabela '$t'" -ForegroundColor Red
    }
}
