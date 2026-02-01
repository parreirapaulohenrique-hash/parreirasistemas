# ============================================
# SCRIPT DE DEPLOY AUTOMÁTICO - ParreiraLog
# ============================================
# Este script faz backup em camadas e envia
# as alterações para o GitHub automaticamente.
# ============================================

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DEPLOY AUTOMÁTICO - ParreiraLog" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectPath = "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch"

# Navegar para a pasta do projeto
Set-Location $projectPath

# ============================================
# ETAPA 1: BACKUP EM CAMADAS
# ============================================
Write-Host "[1/4] Fazendo backup em camadas..." -ForegroundColor Yellow

# Backup 1 -> Backup 2
Write-Host "  → WEB BACKUP 1 → WEB BACKUP 2" -ForegroundColor Gray
Remove-Item -Path "$projectPath\WEB BACKUP 2\*" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path "$projectPath\WEB BACKUP 1\*" -Destination "$projectPath\WEB BACKUP 2\" -Recurse -Force -ErrorAction SilentlyContinue

# Web -> Backup 1
Write-Host "  → WEB → WEB BACKUP 1" -ForegroundColor Gray
Remove-Item -Path "$projectPath\WEB BACKUP 1\*" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path "$projectPath\web\*" -Destination "$projectPath\WEB BACKUP 1\" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "  ✅ Backup concluído!" -ForegroundColor Green
Write-Host ""

# ============================================
# ETAPA 2: ADICIONAR ARQUIVOS
# ============================================
Write-Host "[2/4] Adicionando arquivos ao Git..." -ForegroundColor Yellow
git add .
Write-Host "  ✅ Arquivos adicionados!" -ForegroundColor Green
Write-Host ""

# ============================================
# ETAPA 3: COMMIT
# ============================================
Write-Host "[3/4] Fazendo commit..." -ForegroundColor Yellow

# Gerar mensagem automática com data/hora
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$commitMessage = "deploy: Atualização automática - $timestamp"

# Verificar se há mudanças para commitar
$status = git status --porcelain
if ($status) {
    git commit -m $commitMessage
    Write-Host "  ✅ Commit: $commitMessage" -ForegroundColor Green
}
else {
    Write-Host "  ⚠️ Nenhuma alteração para commitar" -ForegroundColor Yellow
}
Write-Host ""

# ============================================
# ETAPA 4: PUSH PARA O GITHUB
# ============================================
Write-Host "[4/5] Enviando para o GitHub (Branch MAIN)..." -ForegroundColor Yellow
git push origin main
Write-Host "  ✅ Push concluído!" -ForegroundColor Green
Write-Host ""

# ============================================
# Deploy acionado automaticamente pelo GitHub Integration
Write-Host "✅ Push concluído! O Vercel iniciará o deploy automaticamente." -ForegroundColor Green
Write-Host ""
Write-Host "========================================"
Write-Host "  PROCESSO DE ENVIO CONCLUÍDO! 🚀"
Write-Host "========================================"
Write-Host ""
Write-Host "Verifique o status em: https://vercel.com/dashboard"

# ============================================
# FINALIZAÇÃO
# ============================================
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DEPLOY CONCLUÍDO COM SUCESSO! 🚀" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Verifique em: https://vercel.com/dashboard" -ForegroundColor Gray
Write-Host ""
