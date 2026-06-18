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
Write-Host "[1/5] Fazendo backup em camadas..." -ForegroundColor Yellow

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
Write-Host "[2/5] Adicionando arquivos ao Git..." -ForegroundColor Yellow
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
Write-Host "[2.5/5] Sincronizando version.json para o app de despacho..." -ForegroundColor Yellow
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
Write-Host "[3/5] Fazendo commit..." -ForegroundColor Yellow

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
Write-Host "[4/5] Enviando para o GitHub (Branch MAIN)..." -ForegroundColor Yellow
git push origin main
Write-Host "  OK Push concluido! Vercel iniciara o deploy automaticamente." -ForegroundColor Green
Write-Host ""

# ============================================
# ETAPA 4.5: DEPLOY DAS REGRAS DO FIRESTORE
# Requer: Node.js + Firebase CLI instalados
#   Para instalar: https://nodejs.org (LTS)
#   Depois:  npm install -g firebase-tools
#            firebase login
# Quando instalado, as regras sao versionadas
# e deployadas automaticamente junto com o codigo.
# ============================================
Write-Host "[4.5/5] Verificando Firebase CLI para deploy das Firestore Rules..." -ForegroundColor Yellow

$firebaseCli = Get-Command firebase -ErrorAction SilentlyContinue

if ($firebaseCli) {
    Write-Host "  -> Firebase CLI encontrado! Fazendo deploy das regras..." -ForegroundColor Gray

    $rulesFile = "$projectPath\firestore.rules"
    if (Test-Path $rulesFile) {
        try {
            firebase deploy --only firestore:rules --project parreiralog-91904 2>&1 | ForEach-Object {
                Write-Host "     $_" -ForegroundColor Gray
            }
            Write-Host "  OK Firestore Rules deployadas com sucesso!" -ForegroundColor Green
        } catch {
            Write-Host "  ERRO ao fazer deploy das Firestore Rules: $_" -ForegroundColor Red
            Write-Host "  DICA: Execute 'firebase login' e tente novamente." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  AVISO firestore.rules nao encontrado em $rulesFile" -ForegroundColor Yellow
        Write-Host "  DICA: O arquivo deveria estar na raiz do projeto (scratch/)." -ForegroundColor Gray
    }
} else {
    Write-Host "  INFO Firebase CLI nao instalado -- Firestore Rules nao atualizadas." -ForegroundColor DarkYellow
    Write-Host "  INFO As regras atuais (aplicadas manualmente) continuam ativas." -ForegroundColor DarkYellow
    Write-Host "  INFO Para automatizar: instale Node.js (https://nodejs.org) e rode:" -ForegroundColor DarkYellow
    Write-Host "       npm install -g firebase-tools" -ForegroundColor DarkGray
    Write-Host "       firebase login" -ForegroundColor DarkGray
}
Write-Host ""

# ============================================
# ETAPA 5: CONCLUSAO
# ============================================
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host "  DEPLOY CONCLUIDO COM SUCESSO! v5.0"    -ForegroundColor Green
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host ""
Write-Host "  Vercel (Frontend):   https://vercel.com/dashboard" -ForegroundColor Gray
Write-Host "  Firebase (Database): https://console.firebase.google.com" -ForegroundColor Gray
Write-Host ""
