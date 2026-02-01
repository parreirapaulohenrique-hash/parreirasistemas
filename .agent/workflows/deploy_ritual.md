---
description: Ritual de Backup e Atualização de Versão
---

Este workflow automatiza o ritual de backup em camadas e atualização de versão do sistema.

1. Executa a rotação de backups:
   - WEB BACKUP 1 -> WEB BACKUP 2
   - web -> WEB BACKUP 1
2. Atualiza o arquivo `version.json` (manual ou via prompt)

# Passo 1: Executar Rotação de Backup
Execute o seguinte comando no terminal Powershell na raiz do projeto:

```powershell
# Limpa BACKUP 2
Remove-Item -Path ".\WEB BACKUP 2\*" -Recurse -Force -ErrorAction SilentlyContinue

# Sincroniza BACKUP 1 -> BACKUP 2
Copy-Item -Path ".\WEB BACKUP 1\*" -Destination ".\WEB BACKUP 2" -Recurse -Force

# Limpa BACKUP 1
Remove-Item -Path ".\WEB BACKUP 1\*" -Recurse -Force -ErrorAction SilentlyContinue

# Sincroniza web -> BACKUP 1
Copy-Item -Path ".\web\*" -Destination ".\WEB BACKUP 1" -Recurse -Force

Write-Host "✅ Backup em camadas concluído com sucesso!"
```
