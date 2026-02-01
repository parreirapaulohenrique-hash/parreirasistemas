# 📘 Documentação Técnica - ParreiraLog (v2.0)

Esta documentação detalha a arquitetura, estrutura de arquivos e lógica de negócios do sistema **ParreiraLog**. Ela foi desenhada para facilitar a manutenção e evolução do sistema por novos agentes ou desenvolvedores.

---

## 🏗️ Visão Geral e Arquitetura

O **ParreiraLog** é uma **Single Page Application (SPA)** focada em gestão logística (Cotação, Despacho, Entregas).

*   **Frontend**: HTML5, CSS3, Vanilla JavaScript (sem frameworks como React/Vue).
*   **Backend/Persistência**: Google Firebase Firestore.
*   **Arquitetura de Dados**: "Legacy Store" modificado.
    *   O sistema não salva registros individuais para a maioria das entidades. Em vez disso, mantém grandes arrays JSON (`dispatches`, `freight_tables`, etc.) salvos como documentos únicos ou particionados (Chunking) no Firestore.
    *   Isso simula um `localStorage` persistente na nuvem.
*   **Multitenancy (Multi-Empresa)**: Suporte a múltiplos inquilinos (`tenants`). Cada empresa tem seus dados isolados na coleção `tenants/{tenantId}`.

---

## 📂 Estrutura de Arquivos

### Core
*   `index.html`: Ponto de entrada único. Contém todas as "Views" (seções `div` com `display: none`) e Templates.
*   `styles.css`: Estilização global, variáveis CSS e reset.
*   `app.js`: Controlador principal. Gerencia roteamento (`showSection`), inicialização, listeners de eventos globais e lógica de negócio central (Cotação, Dashboard).
*   `utils.js`: Biblioteca de utilitários. Contém a camada de abstração de dados (`Utils.Cloud`), formatação e gerenciamento de usuários.
*   `firebase-config.js`: Configuração e inicialização do Firebase SDK via CDN.

### Módulos de Negócio
*   `delivery-module.js`: Gerencia as views de motoristas (`#view-moto`, `#view-carro`) e lógica de alteração de status de entrega.
*   `acontec-integration.js`: Módulo de integração com API externa (Acontec) para sincronização de clientes.
*   `acontec-ui.js`: Controladores de interface específicos para a tela de integração Acontec.
*   `cnpj-lookup.js`: Utilitário para busca e preenchimento automático de dados de empresas.

### Dados e Assets
*   `data.js`: (Legado/Fallback) Contém bases pré-carregadas de Cidades e Clientes para casos offline ou init.
*   `manifest.json` & `sw.js`: Configurações de PWA (Progressive Web App) para instalação em mobile.

---

## 🔄 Fluxo de Dados e Sincronização (`utils.js`)

A sincronização é o coração do sistema. Diferente de um CRUD tradicional com REST API, o sistema opera assim:

1.  **Leitura**: Ao iniciar (ou trocar de tenant), o `Utils.Cloud.loadAll()` baixa os documentos JSON do Firestore.
2.  **Particionamento (Chunking)**: Se um arquivo JSON exceder ~800kb, o sistema o quebra em partes (`_chunk_0`, `_chunk_1`...) no Firestore. O `utils.js` remonta esses dados automaticamente ao ler.
3.  **Escrita**: Alterações locais são salvas no `localStorage` e enviadas para a nuvem via `Utils.Cloud.save()`.
4.  **Real-time**: Listeners (`onSnapshot`) detectam mudanças na nuvem e atualizam o cliente local, permitindo colaboração (com mecanismos de prevenção de Loop/Echo).

**Coleções do Firestore**:
*   Path: `tenants/{tenantId}/legacy_store/{docId}`
*   Principais `docIds`: `dispatches`, `clients`, `freight_tables`, `app_users`, `carrier_configs`.

---

## 🔐 Autenticação e Permissões

A autenticação é híbrida:
1.  **Conexão Segura**: `firebase.auth().signInAnonymously()` para acessar o Firestore.
2.  **Login de Aplicação**: O usuário deve informar `Tenant ID`, `Usuário` e `Senha`.
    *   Dados de usuários são armazenados no JSON `app_users` dentro do tenant.

**Níveis de Acesso (Roles)**:
O controle é feito via `window.applyRoleRestrictions()` em `app.js`.
*   **Supervisor/Admin**: Acesso total.
*   **Operacional**: Acesso a Cotação, Despacho e Tabelas (sem Configurações/Relatórios).
*   **Motoboy**: Acesso restrito apenas à view `#view-moto`.
*   **Motorista**: Acesso restrito apenas à view `#view-carro`.

---

## 🧩 Funcionalidades Principais (Overview)

### 1. Cotação (`#view-quote`)
*   Entrada: Valor da NF, Peso, Cliente (Busca local no array `clients`).
*   Processamento: `calculateAndSave` (em `app.js`) itera sobre `freight_tables` para encontrar a transportadora mais barata para a cidade/bairro do cliente.
*   Saída: Cards com opções de frete.

### 2. Montagem de Carga (`#view-dispatch` e Dashboard)
*   Dashboard exibe cards agregados por Transportadora.
*   Permite gerar "Romaneios" (PDF/Print) e alterar status das NFs.
*   Monitora horários de corte e alerta sobre atrasos.

### 3. Tabelas de Frete (`#view-rules`)
*   CRUD de regras de frete: Transportadora, Cidade, % Valor, Valor/Kg Excedente, Redespacho.
*   Suporta importação via CSV.

### 4. Integração Acontec (`#view-acontec`)
*   Sincroniza base de clientes de um ERP externo (Acontec) via API REST.
*   Normaliza dados e salva no array local `clients`.

---

## 🛠️ Guia para Novos Desenvolvedores

### Como Adicionar uma Nova Funcionalidade
1.  **HTML**: Crie uma nova `<div id="view-nova-feature" class="view-section">` no `index.html`.
2.  **Menu**: Adicione o link na `<aside>` e a lógica correspondente em `window.showSection` (`app.js`).
3.  **Lógica**: Se for complexo, crie um arquivo JS separado (ex: `feature-x.js`) e importe no `index.html`.
4.  **Dados**: Se precisar persistir dados, use `Utils.saveRaw('chave_nova', dados)` e `Utils.getStorage('chave_nova')`. A sincronização será automática se a chave for adicionada à lista de `keys` em `Utils.Cloud.listen()` e `loadAll()`.

### Pontos de Atenção
*   **NÃO use `document.querySelector` fora de funções**. O DOM pode não estar pronto.
*   **Sempre use `Utils.getStorage`** em vez de `localStorage.getItem` diretamente para evitar erros de parse.
*   **Cuidado com Loops de Sync**: Ao criar listeners que salvam dados, verifique a flag `window.hasAttachedListeners` ou timestamps para não criar loops infinitos entre nuvem e local.

---

**Última Atualização**: 26/01/2026
**Status**: Produção (Estável)
