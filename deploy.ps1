# ============================================
# SCRIPT DE DEPLOY AUTOMATICO - ParreiraLog
# ============================================
# Este script faz backup em camadas e envia
# as alteracoes para o GitHub automaticamente.
# ============================================

Write-Host ""
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "  DEPLOY AUTOMATICO - ParreiraLog"        -ForegroundColor Cyan
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host ""

$projectPath = "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch"

# Navegar para a pasta do projeto
Set-Location $projectPath

# ============================================
# ETAPA 1: BACKUP EM CAMADAS
# ============================================
Write-Host "[1/4] Fazendo backup em camadas..." -ForegroundColor Yellow

Write-Host "  -> WEB BACKUP 1 -> WEB BACKUP 2" -ForegroundColor Gray
Remove-Item -Path "$projectPath\WEB BACKUP 2\*" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path "$projectPath\web\*" -Destination "$projectPath\WEB BACKUP 2\" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "  -> WEB -> WEB BACKUP 1" -ForegroundColor Gray
Remove-Item -Path "$projectPath\WEB BACKUP 1\*" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path "$projectPath\web\*" -Destination "$projectPath\WEB BACKUP 1\" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "  -> PLATFORM BACKUP 1 -> PLATFORM BACKUP 2" -ForegroundColor Gray
Remove-Item -Path "$projectPath\platform backup 2\*" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path "$projectPath\platform backup 1\*" -Destination "$projectPath\platform backup 2\" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "  -> PLATFORM -> PLATFORM BACKUP 1" -ForegroundColor Gray
Remove-Item -Path "$projectPath\platform backup 1\*" -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path "$projectPath\platform\*" -Destination "$projectPath\platform backup 1\" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "  OK Backup (Web + Platform) concluido!" -ForegroundColor Green
Write-Host ""

# ============================================
# ETAPA 2: ADICIONAR ARQUIVOS
# ============================================
Write-Host "[2/4] Adicionando arquivos ao Git..." -ForegroundColor Yellow
git add .
Write-Host "  OK Arquivos adicionados!" -ForegroundColor Green
Write-Host ""

# ============================================
# ETAPA 2.5: SINCRONIZAR version.json
# FIX: platform/version.json e o que atualizamos,
#      mas o app le platform/modules/dispatch/version.json (relativo ao app.js)
#      Sincronizamos automaticamente a cada deploy para que a versao
#      exibida no rodape do app sempre bata com o que foi deployado.
# ============================================
Write-Host "[2.5/4] Sincronizando version.json para o app de despacho..." -ForegroundColor Yellow
$srcVersion  = "$projectPath\platform\version.json"
$destVersion = "$projectPath\platform\modules\dispatch\version.json"
if (Test-Path $srcVersion) {
    Copy-Item -Path $srcVersion -Destination $destVersion -Force
    git add $destVersion
    Write-Host "  OK version.json sincronizado: platform/ -> platform/modules/dispatch/" -ForegroundColor Green
} else {
    Write-Host "  AVISO platform/version.json nao encontrado -- versao nao atualizada no app!" -ForegroundColor Yellow
}
Write-Host ""

# ============================================
# ETAPA 3: COMMIT
# ============================================
Write-Host "[3/4] Fazendo commit..." -ForegroundColor Yellow

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$commitMessage = "deploy: Atualizacao automatica - $timestamp"

$status = git status --porcelain
if ($status) {
    git commit -m $commitMessage
    Write-Host "  OK Commit: $commitMessage" -ForegroundColor Green
} else {
    Write-Host "  AVISO Nenhuma alteracao para commitar" -ForegroundColor Yellow
}
Write-Host ""

# ============================================
# ETAPA 4: PUSH PARA O GITHUB
# ============================================
Write-Host "[4/4] Enviando para o GitHub (Branch MAIN)..." -ForegroundColor Yellow
git push origin main
Write-Host "  OK Push concluido!" -ForegroundColor Green
Write-Host ""

Write-Host "OK Push concluido! O Vercel iniciara o deploy automaticamente." -ForegroundColor Green
Write-Host ""
Write-Host "========================================"
Write-Host "  PROCESSO DE ENVIO CONCLUIDO!"
Write-Host "========================================"
Write-Host ""
Write-Host "Verifique o status em: https://vercel.com/dashboard"
Write-Host ""
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "  DEPLOY CONCLUIDO COM SUCESSO!"          -ForegroundColor Green
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host ""
Write-Host "Verifique em: https://vercel.com/dashboard" -ForegroundColor Gray
Write-Host ""
