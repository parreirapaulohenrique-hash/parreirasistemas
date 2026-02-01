---
description: Rotational backup of web folder (web, web1, web2) before changes
---

1. **Remove old backup (WEB BACKUP 2)**
   ```powershell
   if (Test-Path "WEB BACKUP 2") { Remove-Item "WEB BACKUP 2" -Recurse -Force }
   ```

2. **Shift backup (WEB BACKUP 1 → WEB BACKUP 2)**
   ```powershell
   if (Test-Path "WEB BACKUP 1") { Rename-Item "WEB BACKUP 1" "WEB BACKUP 2" }
   ```

3. **Create new backup of current `web` folder (WEB BACKUP 1)**
   ```powershell
   Copy-Item "web" "WEB BACKUP 1" -Recurse -Force
   ```

4. **Update version.json (increment patch version)**
   ```javascript
   const versionPath = "web/version.json";
   const version = JSON.parse(require('fs').readFileSync(versionPath, 'utf8'));
   const parts = version.version.split('.').map(Number);
   parts[2] = (parts[2] || 0) + 1; // bump patch
   version.version = parts.join('.');
   require('fs').writeFileSync(versionPath, JSON.stringify(version, null, 2));
   ```

5. **Commit (optional)** – if using git, you can add and commit the backup.

**Note:** This workflow uses PowerShell commands (`// turbo` annotation) that will be auto‑executed by the system.
