# 🔌 Documentação - Integração Acontec

## Visão Geral

O sistema de integração com a API Acontec permite sincronizar automaticamente a base de clientes do ERP Acontec com o ParreiraLog, eliminando a necessidade de importação manual de CSV.

---

## 📋 Arquivos Criados

1. **`acontec-integration.js`** - Módulo principal de integração (lógica da API)
2. **`acontec-ui.js`** - Interface e event handlers
3. **Seção no `index.html`** - Interface visual completa

---

## 🚀 Como Configurar

### Passo 1: Obter Credenciais da Acontec

Você precisará solicitar à Acontec:
- **URL da API**: Exemplo `https://api.acontec.com.br/v1`
- **Token de Autenticação** (Bearer Token)

### Passo 2: Configurar no ParreiraLog

1. Acesse o sistema ParreiraLog
2. No menu lateral, clique em **"Integração Acontec"**
3. Preencha os campos:
   - URL da API Acontec
   - Token de Autenticação
4. *(Opcional)* Ative a sincronização automática e defina o intervalo (em minutos)
5. Clique em **"Salvar Configurações"**

### Passo 3: Testar Conexão

1. Após configurar, clique no botão **"Testar Conexão"**
2. O sistema tentará se conectar à API da Acontec
3. Se bem-sucedido, você verá uma mensagem de confirmação

### Passo 4: Sincronizar Clientes

1. Clique no botão **"Sincronizar Agora"**
2. Aguarde o processo completar (uma barra de progresso será exibida)
3. Ao final, você verá:
   - Total de clientes sincronizados
   - Quantos foram adicionados
   - Quantos foram atualizados
   - Eventuais erros

---

## 📊 Funcionalidades

### Sincronização Manual
- Botão **"Sincronizar Agora"** executa sincronização imediata
- Barra de progresso em tempo real
- Relatório detalhado ao final

### Sincronização Automática
- Sincronização periódica sem intervenção manual
- Intervalo configurável (mínimo 5 minutos, máximo 24 horas)
- Pode ser ativada/desativada a qualquer momento

### Estatísticas
- **Total Sincronizado**: Número total de clientes processados
- **Novos Clientes**: Clientes adicionados na última sincronização
- **Atualizados**: Clientes existentes que foram atualizados
- **Erros**: Número de erros encontrados

### Logs
- Histórico completo de todas as ações
- Ícones coloridos por tipo (sucesso, erro, aviso, info)
- Data e hora de cad a evento
- Detalhes técnicos quando aplicável
- Botão para limpar logs antigos

---

## 🔧 Mapeamento de Dados

O sistema mapeia os dados do formato Acontec para o formato ParreiraLog:

| Acontec | ParreiraLog | Observações |
|---------|-------------|-------------|
| `id` ou `codigo` | `codigo` | Identificador único |
| `razao_social` ou `nome_fantasia` | `nome` | Convertido para UPPERCASE |
| `endereco.cidade` ou `cidade` | `cidade` | Convertido para UPPERCASE |
| `endereco.bairro` ou `bairro` | `bairro` | Convertido para UPPERCASE |
| `telefone` ou `celular` | `telefone` | Apenas dígitos |

Campos extras salvos (opcionais):
- `_source`: "acontec"
- `_syncedAt`: Data/hora da sincronização
- `_cnpj`: CNPJ do cliente
- `_email`: Email do cliente

---

## 🛡️ Segurança

- **Token de Autenticação**: Armazenado localmente no navegador
- **Comunicação HTTPS**: Todas as requisições usam protocolo seguro
- **Validação**: Headers de autorização em todas as requisições

---

## ⚙️ Personalização

### Ajustar Estrutura da API

Se a API da Acontec retornar dados em formato diferente do esperado, edite a função `mapAcontecToParreiraLog` em `acontec-integration.js`:

```javascript
mapAcontecToParreiraLog(acontecClient) {
    // Ajuste os mapeamentos conforme a estrutura real da API
    return {
        codigo: acontecClient.id || acontecClient.codigo,
        nome: acontecClient.razao_social.toUpperCase(),
        // ... demais campos
    };
}
```

### Alterar Endpoint

Se o endpoint de clientes for diferente de `/clientes`, edite em `acontec-integration.js`:

```javascript
async fetchClients(page = 1, limit = 100) {
    const url = new URL(`${this.config.apiUrl}/seu-endpoint-customizado`);
    // ...
}
```

---

## 🐛 Solução de Problemas

### Erro: "API não configurada"
**Causa**: URL ou Token não foram preenchidos  
**Solução**: Acesse "Integração Acontec" → Configurar API

### Erro: "HTTP 401 Unauthorized"
**Causa**: Token inválido ou expirado  
**Solução**: Verifique o token com a Acontec e atualize

### Erro: "Failed to fetch" ou "Network Error"
**Causa**: URL incorreta ou API fora do ar  
**Solução**: Verifique a URL e conectividade

### Clientes não aparecem após sincronização
**Causa**: Mapeamento de campos incorreto  
**Solução**: Verifique a função `mapAcontecToParreiraLog` e ajuste conforme estrutura real da API

### Sincronização automática não funciona
**Causa**: Checkbox não marcado ou navegador fechado  
**Solução**: 
1. Certifique-se que "Ativar sincronização automática" está marcado
2. Sincronização automática requer que o navegador permaneça aberto

---

## 📝 Logs e Monitoramento

### Tipos de Log

- 🟢 **Success** (Verde): Operação concluída com êxito
- 🔴 **Error** (Vermelho): Erro crítico
- 🟠 **Warning** (Laranja): Aviso/atenção
- 🔵 **Info** (Azul): Informação

### Interpretar Logs

```
✅ Sincronização concluída: 10 novos, 5 atualizados, 0 erros em 3.2s
```
= 10 clientes adicionados, 5 atualizados, sem erros, processo levou 3.2 segundos

```
❌ Falha na sincronização: Network Error
```
= Erro de rede (verificar conexão e URL da API)

---

## 🔄 Atualizações Futuras

Possíveis melhorias:
- Sincronização incremental (apenas clientes modificados)
- Filtros de sincronização (por cidade, estado, etc.)
- Webhook para sincronização em tempo real
- Integração bidirecional (ParreiraLog → Acontec)

---

## 💡 Dicas

1. **Primeira Sincronização**: Pode levar alguns minutos se houver muitos clientes
2. **Backup**: Faça backup antes da primeira sincronização
3. **Testes**: Use sincronização manual antes de ativar automática
4. **Monitoramento**: Verifique os logs periodicamente
5. **Performance**: Para grandes volumes (milhares de clientes), considere sincronização noturna

---

## 📞 Suporte

Para problemas técnicos:
1. Verifique os logs de sincronização
2. Teste a conexão com a API
3. Consulte a documentação da API Acontec
4. Entre em contato com o suporte da Acontec para questões de API

---

**Versão**: 1.0.0  
**Data**: 2026-01-13  
**Status**: ✅ Operacional
