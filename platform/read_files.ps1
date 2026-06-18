
# Script para ler o PDF e extrair texto legivel
$pdfPath = "C:\Users\Paulo H Parreira\Downloads\Analise da qualidade Plano de conta e Sub Plano.pdf"

# Lê o PDF como bytes e converte para string Latin1 para extrair texto legível
$bytes = [System.IO.File]::ReadAllBytes($pdfPath)
$latin1 = [System.Text.Encoding]::GetEncoding("ISO-8859-1").GetString($bytes)

# Extrai blocos de texto legível (sequências de caracteres ASCII imprimíveis)
$pattern = [regex]'[ -~]{4,}'
$matches_found = $pattern.Matches($latin1)

$output = @()
foreach ($m in $matches_found) {
    $val = $m.Value.Trim()
    if ($val -match '[A-Za-z]{3,}') {
        $output += $val
    }
}

# Salva resultado em arquivo de texto
$output | Out-File -FilePath "C:\Users\Paulo H Parreira\OneDrive\Area de Trabalho\TESTE\pdf_content.txt" -Encoding UTF8

Write-Host "PDF processado. Linhas extraidas: $($output.Count)"
Write-Host "--- PRIMEIRAS 200 LINHAS ---"
$output | Select-Object -First 200
