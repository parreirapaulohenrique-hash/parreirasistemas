---
description: Script para fazer deploy automático com backup, commit e push
---

# Deploy Automático com Backup

Este workflow faz backup em camadas e envia para o GitHub/Vercel automaticamente.

## Passo 1: Executar o Script de Deploy

// turbo-all

Execute o seguinte comando no PowerShell:

```powershell
cd "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch"
.\deploy.ps1
```

O script irá:
1. ✅ Fazer backup em camadas (WEB → BACKUP 1 → BACKUP 2)
2. ✅ Adicionar todos os arquivos alterados
3. ✅ Fazer commit com mensagem automática
4. ✅ Fazer push para o GitHub
5. ✅ Vercel detecta e faz deploy automático

## Passo 2: Verificar no Vercel

Após o push, acesse https://vercel.com/dashboard e verifique se o deploy foi iniciado.
