---
description: Backup em camadas antes de atualizações - Move backup antigo e cria novo
---

# Workflow: Backup em Camadas

Este workflow deve ser executado **ANTES** de iniciar qualquer atualização significativa no projeto.

## Sistema de Rotação:
- **WEB BACKUP 2** = Backup mais antigo (2ª versão anterior)
- **WEB BACKUP 1** = Backup recente (versão anterior imediata)
- **web** = Versão atual em desenvolvimento

## Passos:

### 1. Verificar versões atuais dos backups
```powershell
Get-Content "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\WEB BACKUP 1\version.json"
Get-Content "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\WEB BACKUP 2\version.json"
Get-Content "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\web\version.json"
```

### 2. Limpar BACKUP 2 (mais antigo)
// turbo
```powershell
Remove-Item -Path "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\WEB BACKUP 2\*" -Recurse -Force
```

### 3. Mover BACKUP 1 para BACKUP 2
// turbo
```powershell
Copy-Item -Path "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\WEB BACKUP 1\*" -Destination "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\WEB BACKUP 2\" -Recurse -Force
```

### 4. Limpar BACKUP 1
// turbo
```powershell
Remove-Item -Path "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\WEB BACKUP 1\*" -Recurse -Force
```

### 5. Copiar versão atual para BACKUP 1
// turbo
```powershell
Copy-Item -Path "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\web\*" -Destination "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\WEB BACKUP 1\" -Recurse -Force
```

### 6. Confirmar backup realizado
```powershell
Write-Host "=== BACKUP CONCLUÍDO ===" -ForegroundColor Green
Write-Host "BACKUP 2:" (Get-Content "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\WEB BACKUP 2\version.json" | ConvertFrom-Json).version
Write-Host "BACKUP 1:" (Get-Content "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\WEB BACKUP 1\version.json" | ConvertFrom-Json).version
Write-Host "ATUAL:" (Get-Content "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\web\version.json" | ConvertFrom-Json).version
```

## Após executar este workflow:
- Prossiga com as atualizações normalmente
- Em caso de problemas, restaure de BACKUP 1 (versão imediatamente anterior)
- Se BACKUP 1 também tiver problemas, restaure de BACKUP 2 (2 versões atrás)
