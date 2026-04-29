# Procedimento Operacional Padrão (POP) - Módulo de Vendas

Este documento descreve o fluxo operacional padrão para a realização de vendas no sistema ERP, cobrindo tanto o processo de Venda de Retaguarda (Pedido de Venda) quanto o processo de Frente de Caixa (PDV).

## 1. Fluxo de Venda - Retaguarda (Pedido de Venda)

O módulo de retaguarda é utilizado para vendas que requerem cadastro detalhado de clientes, negociação de preços e emissão de pedidos formais.

### Fluxograma do Processo

```mermaid
flowchart TD
    Inicio([Início]) --> NovaVenda[F1 - Iniciar Nova Venda]
    NovaVenda --> IdentificarCliente{Identificar Cliente?}
    IdentificarCliente -- Sim --> BuscarCliente[Buscar e Selecionar Cliente]
    IdentificarCliente -- Não --> DadosManuais[Preencher Dados Manualmente]
    
    BuscarCliente --> AdicionarItens[Adicionar Itens ao Pedido]
    DadosManuais --> AdicionarItens
    
    subgraph InsercaoItens [Inserção de Itens]
        BuscarProduto[Buscar Produto] --> QtdPreco[Definir Qtd e Preço]
        QtdPreco --> Inserir[Inserir Item]
        Inserir --> MaisItens{Mais Itens?}
        MaisItens -- Sim --> BuscarProduto
    end
    
    AdicionarItens --> MaisItens
    MaisItens -- Não --> Revisao[Revisar Totais]
    
    Revisao --> Gravar{Gravar Venda? (F2)}
    Gravar -- Sim --> Validar[Validar Dados]
    Validar -- Erro --> Corrigir[Corrigir Pendências]
    Corrigir --> Gravar
    Validar -- OK --> Salvar[Salvar Pedido]
    Salvar --> Fim([Fim - Pedido Gravado])
    
    Revisao --> Cancelar{Cancelar? (F4)}
    Cancelar -- Sim --> ConfirmarCancel[Confirmar Cancelamento]
    ConfirmarCancel --> FimCancel([Fim - Venda Cancelada])
```

### Detalhamento das Etapas

1.  **Iniciar Venda (F1)**:
    - O operador pressiona **F1** para limpar a tela e gerar um novo número de pedido.
    - O sistema define a data atual automaticamente.

2.  **Identificação do Cliente**:
    - O operador pode buscar um cliente cadastrado pelo código ou preencher os dados manualmente.
    - O sistema carrega informações de crédito e limite se o cliente for identificado.

3.  **Inserção de Itens**:
    - O operador busca o produto pelo código ou descrição.
    - Define quantidade, preço unitário e descontos, se aplicável.
    - O sistema calcula o subtotal automaticamente.

4.  **Fechamento (F2)**:
    - O operador pressiona **F2** para gravar o pedido.
    - O sistema valida se há itens e cliente informado.
    - O pedido é salvo no banco de dados (Local/Nuvem).

---

## 2. Fluxo de Venda - Frente de Caixa (PDV)

O módulo PDV é otimizado para vendas rápidas de balcão, com foco em agilidade e uso de atalhos de teclado.

### Fluxograma do Processo

```mermaid
flowchart TD
    Inicio([Início]) --> IdentificarProd[Ler Código do Produto]
    IdentificarProd --> Qtd{Qtd > 1?}
    Qtd -- Sim --> DefinirQtd[Informar Quantidade]
    Qtd -- Não --> AddItem
    DefinirQtd --> AddItem[Adicionar Item (Enter)]
    
    AddItem --> MaisItens{Mais Itens?}
    MaisItens -- Sim --> IdentificarProd
    MaisItens -- Não --> Subtotal[Verificar Subtotal]
    
    Subtotal --> Acoes{Ações Extras?}
    Acoes -- Desconto (F3) --> AplicarDesc[Aplicar Desconto no Total]
    Acoes -- Cancelar Item (F4) --> CancelItem[Remover Último Item]
    Acoes -- Finalizar --> Pagamento[Escolher Pagamento]
    
    AplicarDesc --> Pagamento
    CancelItem --> MaisItens
    
    subgraph PagamentoFluxo [Finalização]
        Pagamento --> Dinheiro[F5 - Dinheiro]
        Pagamento --> Pix[F6 - PIX]
        Pagamento --> Credito[F7 - Crédito]
        Pagamento --> Debito[F8 - Débito]
    end
    
    Dinheiro --> CalcTroco[Informar Valor -> Calcular Troco]
    CalcTroco --> EmitirCupom[Emitir Comprovante]
    Pix --> EmitirCupom
    Credito --> EmitirCupom
    Debito --> EmitirCupom
    
    EmitirCupom --> Fim([Fim - Venda Concluída])
```

### Detalhamento das Etapas

1.  **Adicionar Itens**:
    - O processo é contínuo. O operador bipa ou digita o código do produto e pressiona **Enter**.
    - Para quantidades maiores que 1, o operador deve alterar o campo de quantidade antes de bipar.

2.  **Funções Especiais**:
    - **F3 - Desconto**: Aplica um desconto no valor total da venda.
    - **F4 - Cancelar Item**: Remove o último item lançado, caso haja erro.

3.  **Finalização e Pagamento**:
    - O operador escolhe a forma de pagamento utilizando as teclas de função:
        - **F5**: Dinheiro (Calcula troco).
        - **F6**: PIX.
        - **F7**: Cartão de Crédito.
        - **F8**: Cartão de Débito.
    - Após a confirmação, a venda é registrada e o caixa está livre para o próximo cliente.

## 3. Cancelamento de Vendas

- **Em Andamento**: Durante a digitação, pressione **ESC** (no PDV) ou **F4** (na Retaguarda) para cancelar o processo atual e limpar a tela.
- **Vendas Gravadas**: Utilize o módulo de Gerenciamento de Vendas para localizar a venda por período ou número e realizar o estorno/cancelamento formal.
