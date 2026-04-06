# 🚚 AGENTE DESPACHO — Contexto e Histórico de Melhorias
> Arquivo de contexto para continuidade do desenvolvimento do Módulo de Despacho
> **Última atualização:** 2026-04-06 | **Versão atual:** Dispatch v3.8.5 | Platform v11.8.6

---

## 📍 Localização do Módulo
```
C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\platform\modules\dispatch\
```
**Deploy:** Vercel via `deploy.ps1` em `C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\`

---

## ✅ Melhorias Implementadas Nesta Sessão

### v3.7.9 — FOB: Renomeação + Posicionamento Fixo + Seletor de Transportadora
- Renomeado de "FOB (Coleta)" para apenas **"FOB"**
- FOB fixado **sempre como última opção** na lista de cotações
- Adicionado **dropdown de seleção de transportadora** no card FOB
- Despacho salvo como `"FOB - [Nome da Transportadora]"` para rastreabilidade
- Validação obrigatória de transportadora antes de confirmar despacho FOB

### v3.8.0 — Reimpressão de Romaneios
- Botão **"Reimprimir"** adicionado na aba **Gestão de Romaneios**
- Funciona tanto para romaneios **Pendentes** quanto **Arquivados**
- Função `window.reimprimirRomaneio(romaneioId)` busca NFs originais e reconstrói o PDF
- Coluna "Ações" adicionada na tabela de Romaneios Arquivados (`index.html`)

### v3.8.1 — Data do Despacho no WhatsApp ao Vendedor
- Texto pré-definido enviado ao vendedor agora inclui a **data do despacho**
- Formato: `"foi despachado em DD/MM/YYYY via [Transportadora]"`
- Fallback para `d.date` caso `d.dispatchedAt` não exista

### v3.8.2 — Correção: FOB alimentando cards do Painel
- Cards do Painel não exibiam itens FOB (carrier era `"FOB - BRASPRESS"` vs `"BRASPRESS"`)
- **Solução:** `renderDashboard` normaliza o carrier removendo prefixo `"FOB - "` antes de agrupar
- `openShipmentModal` filtra por exact match OU `"FOB - " + carrier`

### v3.8.3 — Correção: Erro "v1.8.x (Error)" no rodapé
- Código tentava acessar `data.date` mas `version.json` usa campo `lastUpdate`
- **Solução:** leitura com fallback `data.date || data.lastUpdate || ''`
- Texto de erro genérico melhorado para "v? (Erro ao carregar)"

### v3.8.4 — FOB: Consulta dinâmica de horário e prazo
- Ao selecionar a transportadora no card FOB, sistema consulta `freight_tables`
- Busca regra por `(transportadora selecionada + cidade de destino do despacho)`
- Exibe painel dinâmico: 🚚 Saída: `HH:MM` | 🕒 Prazo: `X dias`
- Se sem regra cadastrada: exibe aviso em amarelo

### v3.8.5 — FOB: Remoção de texto estático fixo
- Removidos `horarios: 'Qualquer'` e `leadTime: 'Imediato (Coleta)'` hardcoded do objeto FOB
- A linha "Saídas: Qualquer | Entrega: Imediato (Coleta)" não aparece mais no card

---

## 🏗️ Arquitetura e Estrutura do Módulo

### Arquivos Principais
| Arquivo | Responsabilidade |
|---|---|
| `app.js` | Lógica principal: cotação, painel, despacho, romaneios (~6300 linhas) |
| `index.html` | Interface: todas as abas e views (~2230 linhas) |
| `utils.js` | Utilitários: Firebase sync, formatação, storage |
| `delivery-module.js` | Módulo Moto/Carro Entrega |
| `data.js` | Dados de cidades, tabelas iniciais |
| `version.json` | Controle de versão do módulo dispatch |

### Storage (Firebase + localStorage sincronizados)
| Chave | Conteúdo |
|---|---|
| `dispatches` | Histórico de todos os despachos (`status: 'Pendente Despacho'` ou `'Despachado'`) |
| `app_romaneios` | Romaneios gerados (`status: 'em_rota'` ou `'baixado'`) |
| `freight_tables` | Tabelas de frete por transportadora/cidade (`transportadora`, `cidade`, `horarios`, `leadTime`, ...) |
| `carrier_list` | Lista de nomes de transportadoras cadastradas |
| `carrier_info_v2` | Info extra das transportadoras (CNPJ, endereço, confiabilidade) |
| `app_sellers` | Vendedores cadastrados (`id`, `name`, `phone`) |
| `app_users` | Usuários do sistema (`login`, `role`, `name`) |
| `clients` | Cadastro de clientes |

### Perfis RBAC (Controle de Acesso)
| Role | Acesso |
|---|---|
| `admin` | Completo |
| `operador` | Completo exceto configurações críticas |
| `motoboy` | Apenas aba **Moto Entrega** |
| `motorista` | Apenas aba **Carro Entrega** |

### Fluxo de Despacho
```
Cotação (quote) 
  → confirmDispatch() → salva em 'dispatches' (status: Pendente Despacho)
  → Painel renderDashboard() → Cards por transportadora
  → openShipmentModal() → Seleciona NFs + Gera Romaneio
  → generateRomaneioAction() → salva em 'app_romaneios' + imprime
  → Aba Baixa Romaneio → confirmarBaixaRomaneio() → status: 'baixado'
```

### Lógica FOB (v3.7.9+)
- **Carrier salvo como:** `"FOB - BRASPRESS"` (ex.)
- **Dashboard agrupa por:** strip do prefixo `"FOB - "` → card `"BRASPRESS"`
- **Modal mostra:** itens com carrier `=== "BRASPRESS"` OU `=== "FOB - BRASPRESS"`
- **Romaneio:** FOB impresso junto com os demais itens da transportadora
- **Valor na NF do frete:** R$ 0,00 (frete por conta do cliente)

---

## 🔎 Funções Globais Importantes (window.*)

| Função | Linha aprox. | Descrição |
|---|---|---|
| `renderDashboard()` | 4277 | Renderiza cards de transportadoras no painel |
| `openShipmentModal(carrier)` | 4413 | Abre modal de despacho para uma transportadora |
| `generateRomaneioAction()` | 4562 | Gera e imprime o romaneio |
| `printSpecificRomaneio(carrier, items)` | 4725 | Gera o PDF do romaneio |
| `renderBaixaRomaneios()` | ~6045 | Renderiza tabelas de baixa de romaneios |
| `reimprimirRomaneio(id)` | ~6019 | Reimprimir romaneio pelo ID |
| `confirmarBaixaRomaneio(id)` | ~6110 | Arquiva (dá baixa) no romaneio |
| `sendWhatsAppVendedor(id, silent)` | ~6290 | Abre WhatsApp com mensagem para o vendedor |
| `onFobCarrierChange(index)` | ~1607 | Consulta horários/prazo ao selecionar transportadora FOB |

---

## 📋 Pendências e Sugestões Futuras

- [ ] **Sincronização Firebase WMS** — `app_romaneios` confirmado no Firebase, mas WMS ainda usa localStorage majoritariamente
- [ ] **Integração MaxData ERP** — Planejada via Triggers + Firebase + Procedures SQL (discutido mas não implementado)
- [ ] **Relatório de FOB** — Filtro específico para despachos FOB nos relatórios
- [ ] **Notificação automática** para transportadora selecionada no FOB

---

## 🚀 Como fazer deploy
```powershell
cd C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\
powershell -File .\deploy.ps1
```
O script automaticamente: faz backup em camadas → commit Git → push → Vercel deploy automático.

---

*Gerado automaticamente pelo Agente Despacho em 2026-04-06*
