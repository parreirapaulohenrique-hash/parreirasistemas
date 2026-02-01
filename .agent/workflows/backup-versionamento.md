---
description: Política de backup e versionamento antes de alterações no código
---

# Backup Rotativo e Versionamento

**IMPORTANTE**: Este workflow deve ser seguido ANTES de qualquer alteração nos arquivos do projeto.

## Passos de Backup (Rolling Backup)

// turbo-all

1. **Limpar WEB BACKUP 2** (para receber o conteúdo antigo de backup 1):
```powershell
Remove-Item -Path "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\WEB BACKUP 2\*" -Recurse -Force -ErrorAction SilentlyContinue
```

2. **Mover WEB BACKUP 1 → WEB BACKUP 2**:
```powershell
Copy-Item -Path "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\WEB BACKUP 1\*" -Destination "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\WEB BACKUP 2\" -Recurse -Force
```

3. **Limpar WEB BACKUP 1** (para receber o código atual):
```powershell
Remove-Item -Path "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\WEB BACKUP 1\*" -Recurse -Force -ErrorAction SilentlyContinue
```

4. **Copiar WEB atual → WEB BACKUP 1**:
```powershell
Copy-Item -Path "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\web\*" -Destination "C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\WEB BACKUP 1\" -Recurse -Force
```

## Após Fazer as Alterações

5. **Atualizar version.json**: Incrementar a versão e descrever a alteração:
   - Localização: `C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\web\version.json`
   - Formato:
   ```json
   {
     "version": "1.8.XX",
     "date": "YYYY-MM-DD",
     "changes": "Descrição breve da alteração"
   }
   ```

## Regra de Versionamento

- **Patch (1.8.X → 1.8.X+1)**: Correções de bugs, ajustes menores
- **Minor (1.X.0 → 1.X+1.0)**: Novas funcionalidades
- **Major (X.0.0 → X+1.0.0)**: Mudanças estruturais significativas

## Estrutura de Backups

```
scratch/
├── web/                  ← Código ATUAL (produção)
├── WEB BACKUP 1/         ← Versão ANTERIOR (1 alteração atrás)
└── WEB BACKUP 2/         ← Versão ANTIGA (2 alterações atrás)
```

Isso garante sempre **duas versões anteriores** disponíveis para restauração imediata caso algo dê errado.
