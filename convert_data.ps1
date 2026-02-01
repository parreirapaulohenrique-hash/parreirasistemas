$clientesPath = ".\clientes.csv"
$fretePath = ".\tabelafrete.csv"
$outPath = ".\web\data.js"

# Function to escape Single Quotes for JS string
function Safe-Str($val) {
    if (!$val) { return "" }
    return $val.ToString().Replace("'", "\'").Trim()
}

$jsContent = "window.initialClientes = [" + [Environment]::NewLine

# --- Process Clientes ---
Write-Host "Processing Clientes..."
$lines = Get-Content $clientesPath -Encoding Default
# Skip Header? Assuming line 0 is header "C-digo..."
for ($i = 1; $i -lt $lines.Count; $i++) {
    $line = $lines[$i].Trim()
    if ($line -eq "") { continue }
    
    $cols = $line.Split(';')
    if ($cols.Count -lt 2) { continue }
    
    $cod = Safe-Str $cols[0]
    $nome = Safe-Str $cols[1]
    
    # MAPPING BASED ON INVESTIGATION
    # Col 0: Code
    # Col 1: Name
    # Col 4: Neighborhood (Bairro)
    # Col 5: City (Cidade)
    # Col 6: State (UF)
    
    $bairro = "-"
    $city = "N/I"

    if ($cols.Count -gt 5) {
        $cleanCity = Safe-Str $cols[5]
        if ($cleanCity.Length -gt 2) { $city = $cleanCity }
        
        $cleanBairro = Safe-Str $cols[4]
        if ($cleanBairro.Length -gt 2) { $bairro = $cleanBairro }
    }
    
    # Fallback: If City is still N/I or looked like a phone number, try Heuristic
    if ($city -eq "N/I" -or $city -match "[0-9]") {
        $potentialCities = @("REDENCAO", "XINGUARA", "RIO MARIA", "TUCUMA", "OURILANDIA", "CANAA", "MARABA", "ALTAMIRA", "PARAUAPEBAS", "CONCEICAO DO ARAGUAIA", "SANTANA DO ARAGUAI", "AGUA AZUL DO NORTE")
        foreach ($pc in $potentialCities) {
            if ($line.ToUpper().Contains($pc)) {
                $city = $pc
                break
            }
        }
    }

    $jsContent += "    { codigo: '$cod', nome: '$nome', cidade: '$city', bairro: '$bairro' }," + [Environment]::NewLine
}

# Remove last comma
$jsContent = $jsContent.TrimEnd("," + [Environment]::NewLine)
$jsContent += "];" + [Environment]::NewLine + [Environment]::NewLine

# --- Process Tabelas ---
$jsContent += "window.initialTabelas = [" + [Environment]::NewLine
Write-Host "Processing Tabelas..."
$linesF = Get-Content $fretePath -Encoding Default

for ($i = 1; $i -lt $linesF.Count; $i++) {
    $line = $linesF[$i].Trim()
    if ($line -eq "") { continue }
    
    $cols = $line.Split(';')
    # Expected: CIDADE;TRANSPORTADORA;...
    if ($cols.Count -lt 2) { continue }
    
    $city = Safe-Str $cols[0]
    $carrier = Safe-Str $cols[1]
    
    if ($city -eq "" -or $carrier -eq "") { continue }

    # MAPPING CONFIRMED
    # Col 0: City
    # Col 1: Carrier
    # Col 2: Horarios (e.g., 08:00/18:00)
    # Col 3: Percentual (e.g., 0,028 or 4,16) -> Need to normalize
    # Col 4: Minimo
    # Col 5: Valor Excedente
    # Col 6: Redespacho
    
    $horarios = Safe-Str $cols[2]
    
    # Parse Percent
    $rawPct = $cols[3].Replace(',', '.')
    $percent = 0
    if ($rawPct -match "[0-9]") {
        try {
            $pVal = [double]$rawPct
            if ($pVal -lt 1 -and $pVal -gt 0) { $pVal = $pVal * 100 } # Convert 0.03 to 3.0
            $percent = $pVal
        }
        catch { $percent = 0 }
    }
    
    # Parse Min
    $rawMin = $cols[4].Replace(',', '.')
    $min = 0
    if ($rawMin -match "[0-9]") { try { $min = [double]$rawMin } catch {} }

    # Parse Excess
    $rawExc = $cols[5].Replace(',', '.')
    $excess = 0
    if ($rawExc -match "[0-9]") { try { $excess = [double]$rawExc } catch {} }
    
    $redespacho = ""
    if ($cols.Count -gt 6) { $redespacho = Safe-Str $cols[6] }

    # Default Limit Logic
    $limit = 0 # 0 means no limit
    if ($carrier.ToUpper().Contains("VIOPEX")) {
        $limit = 90
        if ($excess -eq 0) { $excess = 1.75 } # Default if not specified in CSV for VIOPEX
    }
    
    $jsContent += "    { "
    $jsContent += "cidade: '$city', "
    $jsContent += "transportadora: '$carrier', "
    $jsContent += "horarios: '$horarios', "
    $jsContent += "percentual: $percent, "
    $jsContent += "minimo: $min, "
    $jsContent += "limitePeso: $limit, "
    $jsContent += "valorExcedente: $excess, "
    $jsContent += "redespacho: '$redespacho' "
    $jsContent += "}," + [Environment]::NewLine
}
$jsContent = $jsContent.TrimEnd("," + [Environment]::NewLine)
$jsContent += "];" + [Environment]::NewLine

Set-Content -Path $outPath -Value $jsContent -Encoding UTF8
Write-Host "Done! saved to $outPath"
