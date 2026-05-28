window.MASTER_ACCOUNTS = [

  // ── Título ──────────────────────────────────────────────────────────────────
  { "codigo": "HEADER", "descricao": "Fluxo de Caixa 2026 CTR" },

  // ══════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 1 — Disponíveis Nas Contas Movimento inicial
  //   TODOS os códigos começam com 1. para respeitar o número do grupo
  // ══════════════════════════════════════════════════════════════════════════════
  { "codigo": "HEADER", "descricao": "Disponíveis Nas Contas Movimento inicial" },

  { "codigo": "1.1",    "descricao": "BANCO DO BRASIL C.C.60409-7 MATRIZ" },
  { "codigo": "1.2",    "descricao": "BRADESCO 15232-3 MATRIZ" },
  { "codigo": "1.3",    "descricao": "BANCO STONE MATRIZ C.C 40256726-7" },
  { "codigo": "1.5",    "descricao": "BANCO DA AMAZONIA 071730-7 MATRIZ" },
  { "codigo": "1.6",    "descricao": "ITAU C.C.98671-6 MATRIZ" },
  { "codigo": "1.9",    "descricao": "CONTA PERDA/ROUBO/BONIFICAÇÃO E DOAÇÃO" },


  // ══════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 2 — Total Receitas Operacionais / Vendas
  //   TODOS os códigos começam com 2. para respeitar o número do grupo
  // ══════════════════════════════════════════════════════════════════════════════
  { "codigo": "HEADER", "descricao": "Total Receitas Operacionais / Vendas" },

  { "codigo": "2.1",    "descricao": "Receita com Vendas" },
  { "codigo": "2.1.01", "descricao": "Receita em Dinheiro" },
  { "codigo": "2.1.01", "descricao": "Receita em Cartão (Crédito e Débito)" },
  { "codigo": "2.1.01", "descricao": "Receita de Cheque A Vista" },
  { "codigo": "2.1.01", "descricao": "Receita de Cheque Pré" },
  { "codigo": "2.1.01", "descricao": "Recebimento de Carteira (Notinha)" },
  { "codigo": "2.1.01", "descricao": "Recebimento de Boletos" },
  { "codigo": "2.1.01", "descricao": "Recebimento em Depósito e Dep. PIX" },
  { "codigo": "2.1.02", "descricao": "Recebimento Cheque Devolvido" },

  { "codigo": "2.5",    "descricao": "Receita de Garantias" },
  { "codigo": "2.5.01", "descricao": "RECEITA EM DINHEIRO" },
  { "codigo": "2.5.02", "descricao": "RECEITA EM MERCADORIA" },

  // ── Custo de Aquisição (seção 3) ────────────────────────────────────────────
  //   TODOS os códigos começam com 3. para respeitar o número do grupo
  { "codigo": "HEADER", "descricao": "Custo de Aquisição" },
  { "codigo": "3.1",    "descricao": "Despesa Com Custo de Aquisição" },
  { "codigo": "3.1.01", "descricao": "FORNECEDORES DE MERCADORIAS REVENDA" },
  { "codigo": "3.1.02", "descricao": "ADIANT. FORNEC. MERCA. REVENDA" },
  { "codigo": "3.1.03", "descricao": "TRANSPORTADORA MERCA. REVENDA" },
  { "codigo": "3.1.04", "descricao": "OUTROS CUSTOS DE MERC.REVENDA" },
  { "codigo": "3.1.05", "descricao": "TRANSFE DE MERCAD REVENDA MATRIZ" },

  { "codigo": "3.2",    "descricao": "Inadimplência e Perdas" },
  { "codigo": "3.2.01", "descricao": "CONTAS PERDIDAS/NÃO PAGAS" },
  { "codigo": "3.2.02", "descricao": "BOLETOS DESCONTADOS DEVOLVIDOS" },
  { "codigo": "3.2.03", "descricao": "CHEQUES DEVOLVIDOS" },
  { "codigo": "3.2.04", "descricao": "BOLETOS DESCONTADOS DEVOLVIDOS" },
  { "codigo": "3.2.05", "descricao": "PERDA,  ROUBO  E  DETERIORAÇÃO" },

  { "codigo": "3.3",    "descricao": "Impostos" },
  { "codigo": "3.3.02", "descricao": "IRPJ (SE ESTIVER NO CMV)" },
  { "codigo": "3.3.03", "descricao": "CSSL (SE ESTIVER NO CMV)" },
  { "codigo": "3.3.04", "descricao": "COFINS (SE ESTIVER NO CMV)" },
  { "codigo": "3.3.05", "descricao": "PIS (SE ESTIVER NO CMV)" },
  { "codigo": "3.3.06", "descricao": "ICMS – Normal (SE ESTIVER NO CMV)" },
  { "codigo": "3.3.07", "descricao": "SUBSTITUIÇÃO TRIBUTARIA SAÍDA (TARE)" },
  { "codigo": "3.3.08", "descricao": "SUBSTITUIÇÃO TRIBUTÁRIA NA ENTRADA" },
  { "codigo": "3.3.09", "descricao": "FUNDO DESENVOLVIMENTO ECONOMICO (TARE)" },
  { "codigo": "3.3.11", "descricao": "Impostos Parcelado" },

  { "codigo": "HEADER", "descricao": "Total dos Custos" },
  { "codigo": "HEADER", "descricao": "Receita Operacional Bruta" },

  // ══════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 4 — Despesas Operac. Fixas e Variáveis  (já usava 4.x — mantido)
  // ══════════════════════════════════════════════════════════════════════════════
  { "codigo": "HEADER", "descricao": "Despesas Operac. Fixas e Variáveis" },

  // ── 4.1 DESPESA COM VENDAS ───────────────────────────────────────────────────
  { "codigo": "4.1",    "descricao": "DESPESA COM VENDAS" },
  { "codigo": "4.1.1",  "descricao": "Marketing e Propaganda" },
  { "codigo": "4.1.2",  "descricao": "Promoções e Eventos (Brindes/Café da Manhã p clientes/etc)" },
  { "codigo": "4.1.3",  "descricao": "Sacolas e Embalagens" },
  { "codigo": "4.1.4",  "descricao": "Diarias e Despesas com Vendedor (passagem ônibus, hotel. Etc)" },
  { "codigo": "4.1.5",  "descricao": "Comissão Representente Comercial" },
  { "codigo": "4.1.6",  "descricao": "Frete com entrega de vendas" },
  { "codigo": "4.1.7",  "descricao": "Taxas C/ Cart Créd/Débit" },
  { "codigo": "4.1.8",  "descricao": "Serviço Motoboy Entrega Vendas" },
  { "codigo": "4.1.9",  "descricao": "Pgto Distrato Repres Comercial" },
  { "codigo": "4.1.10", "descricao": "Tarifa Pix Recebido" },

  // ── 4.2 DESPESA COM FUNCIONÁRIO ─────────────────────────────────────────────
  { "codigo": "4.2",    "descricao": "DESPESA COM FUNCIONÁRIO" },
  { "codigo": "4.2.1",  "descricao": "Salário (CLT)" },
  { "codigo": "4.2.2",  "descricao": "Adiantamento Salários/Vales" },
  { "codigo": "4.2.3",  "descricao": "Auxilio Alimentação/Refeição" },
  { "codigo": "4.2.4",  "descricao": "Auxilio Combustível" },
  { "codigo": "4.2.5",  "descricao": "Seguro de Vida Funcionarios" },
  { "codigo": "4.2.6",  "descricao": "Confraternização e Premiação" },
  { "codigo": "4.2.7",  "descricao": "Viagens e Estadias Funcionarios" },
  { "codigo": "4.2.8",  "descricao": "Treinamento e Cursos" },
  { "codigo": "4.2.9",  "descricao": "Ajuda de Custo Faculdade/Pós Graduação" },
  { "codigo": "4.2.10", "descricao": "Férias" },
  { "codigo": "4.2.11", "descricao": "Auxilio Saúde e Odontológico" },
  { "codigo": "4.2.12", "descricao": "Vale Transporte" },
  { "codigo": "4.2.13", "descricao": "FGTS" },
  { "codigo": "4.2.14", "descricao": "INSS/GPS" },
  { "codigo": "4.2.15", "descricao": "Contribuição Sindical" },
  { "codigo": "4.2.16", "descricao": "Rescisão Trabalhista" },
  { "codigo": "4.2.17", "descricao": "Seleção e Contratação" },
  { "codigo": "4.2.18", "descricao": "ASO", "aliases": [] },
  { "codigo": "4.2.19", "descricao": "IRRF S/ Salário" },
  { "codigo": "4.2.20", "descricao": "Despesa com Terceirizado" },
  { "codigo": "4.2.21", "descricao": "Uniformes e EPI" },
  { "codigo": "4.2.22", "descricao": "Adiantamento de 13º Salário" },
  { "codigo": "4.2.23", "descricao": "Decimo Terceiro Integral" },

  // ── 4.3 DESPESAS INFORMÁTICA ─────────────────────────────────────────────────
  { "codigo": "4.3",    "descricao": "DESPESAS INFORMÁTICA" },
  { "codigo": "4.3.1",  "descricao": "Aquisição Equipamento Informa. Não Imobilizavel" },
  { "codigo": "4.3.3",  "descricao": "Consultoria de TI" },
  { "codigo": "4.3.4",  "descricao": "Mensalidade Programa de Tecnologia Informatica" },
  { "codigo": "4.3.5",  "descricao": "Manut e Reparos em Equipame. Informati" },
  { "codigo": "4.3.6",  "descricao": "Manutenção Sitemas e Softwares" },
  { "codigo": "4.3.7",  "descricao": "Locação Equipamento Informatica" },
  { "codigo": "4.3.8",  "descricao": "Transmissão de Dados Servidor" },
  { "codigo": "4.3.9",  "descricao": "Viagens e Estadias - CPD" },

  // ── 4.4 ADMINISTRATIVAS ──────────────────────────────────────────────────────
  { "codigo": "4.4",    "descricao": "ADMINISTRATIVAS" },
  { "codigo": "4.4.1",  "descricao": "Supermercado/Padaria/Farmácia" },
  { "codigo": "4.4.2",  "descricao": "Material Administrativo de Expediente" },
  { "codigo": "4.4.3",  "descricao": "Correios/Gollog/Latam Cargas" },
  { "codigo": "4.4.4",  "descricao": "Cartório" },
  { "codigo": "4.4.6",  "descricao": "Manutenção/ reforma/ reparos" },
  { "codigo": "4.4.7",  "descricao": "Diária de Prestador de Serviço" },
  { "codigo": "4.4.8",  "descricao": "Consultoria (RH/Empresarial/Contábil/Etc)" },
  { "codigo": "4.4.9",  "descricao": "Honorarios Advogado" },
  { "codigo": "4.4.10", "descricao": "Taxas Administrativas (Alvará de Funcio, taxas)" },
  { "codigo": "4.4.11", "descricao": "Despesa com Processos Judiciais" },
  { "codigo": "4.4.12", "descricao": "Equipe de Cobrança" },
  { "codigo": "4.4.13", "descricao": "Seguradora Predial / Equipamento" },
  { "codigo": "4.4.14", "descricao": "Consulta de crédito SPC/Serasa" },
  { "codigo": "4.4.15", "descricao": "Frete Compra de Material Uso e Consumo" },
  { "codigo": "4.4.16", "descricao": "Pro labore" },
  { "codigo": "4.4.17", "descricao": "Multas Administrativas e trabalhistas" },
  { "codigo": "4.4.18", "descricao": "Seguro Prestamista - Variavel (Emprestimo)" },
  { "codigo": "4.4.19", "descricao": "Contribuições e Doações" },
  { "codigo": "4.4.20", "descricao": "Aquisi. Equipam. ADM não Imobilizavel" },

  // ── 4.5 DESPESAS FIXAS ───────────────────────────────────────────────────────
  { "codigo": "4.5",      "descricao": "DESPESAS FIXAS" },
  { "codigo": "4.5.1",    "descricao": "Conta de Água" },
  { "codigo": "4.5.2",    "descricao": "Conta de Energia" },
  { "codigo": "4.5.3",    "descricao": "Conta de Telefone Fixo/Internet" },
  { "codigo": "4.5.4",    "descricao": "Conta de Celular" },
  { "codigo": "4.5.5",    "descricao": "Aluguel Predial" },
  { "codigo": "4.5.6",    "descricao": "Aluguel Maquina de Cartão" },
  { "codigo": "4.5.7",    "descricao": "Empresa de Vigilância e Monitoramento" },
  { "codigo": "4.5.9",    "descricao": "Sindicato Patronal / Entidades de apoio Comercio/Indus" },
  { "codigo": "4.5.10",   "descricao": "Honorarios Contabilidade" },
  { "codigo": "4.5.10.1", "descricao": "DECIMO TERCEIRO CONTABILIDADE" },

  // ── 4.6 DESPESAS FINANCEIRAS ─────────────────────────────────────────────────
  { "codigo": "4.6",    "descricao": "DESPESAS FINANCEIRAS" },
  { "codigo": "4.6.1",  "descricao": "Tarifas Bancárias" },
  { "codigo": "4.6.2",  "descricao": "IOF" },
  { "codigo": "4.6.3",  "descricao": "Perdas e Devedores Duvidosos" },
  { "codigo": "4.6.5",  "descricao": "Multa e Juros de Mora Pagamento" },
  { "codigo": "4.6.7",  "descricao": "Falta Acerto Caixa" },
  { "codigo": "4.6.8",  "descricao": "Juros Sobre Emprestimos" },
  { "codigo": "4.6.9",  "descricao": "Recuperacao de Cred Devedor Dúv" },
  { "codigo": "4.6.10", "descricao": "Descontos Obtidos" },
  { "codigo": "4.6.12", "descricao": "Juros Desconto de Boletos" },
  { "codigo": "4.6.14", "descricao": "Juros Antec. Cartões Créd/Débito" },
  { "codigo": "4.6.15", "descricao": "IRRF Sobre Aplicação Financeira" },
  { "codigo": "4.6.16", "descricao": "Descontos Financeiros" },
  { "codigo": "4.6.17", "descricao": "Juros Desconto de Boletos" },

  // ── 4.7 DESPESAS COM VEÍCULOS ────────────────────────────────────────────────
  { "codigo": "4.7",    "descricao": "DESPESAS COM VEÍCULOS" },
  { "codigo": "4.7.1",  "descricao": "Combustível e Lubrificantes" },
  { "codigo": "4.7.2",  "descricao": "Manutenção Veicular" },
  { "codigo": "4.7.3",  "descricao": "IPVA e outras taxas" },
  { "codigo": "4.7.4",  "descricao": "Multa" },
  { "codigo": "4.7.5",  "descricao": "Despesas com Estacionamento" },
  { "codigo": "4.7.6",  "descricao": "Aluguel de Veículo" },
  { "codigo": "4.7.7",  "descricao": "Rastreamento por GPS" },
  { "codigo": "4.7.8",  "descricao": "Seguro Veicular" },
  { "codigo": "4.7.9",  "descricao": "Pedágio e Travessia de Balsa" },

  // ── 4.8 IMPOSTOS ADMINISTRATIVOS ─────────────────────────────────────────────
  { "codigo": "4.8",    "descricao": "IMPOSTOS ADMINISTRATIVOS" },
  { "codigo": "4.8.1",  "descricao": "ICMS-DIFERENCIAL DE ALIQUOTA" },
  { "codigo": "4.8.2",  "descricao": "IR" },
  { "codigo": "4.8.3",  "descricao": "CSLL" },
  { "codigo": "4.8.4",  "descricao": "IPTU" },
  { "codigo": "4.8.5",  "descricao": "Outros Tributos Municipais" },
  { "codigo": "4.8.6",  "descricao": "Outros Tributos Estaduais" },
  { "codigo": "4.8.7",  "descricao": "Outros Tributos Federais" },
  { "codigo": "4.8.8",  "descricao": "IRRF S/ Serviço de Terceiro" },
  { "codigo": "4.8.9",  "descricao": "Multa S/ Infrações Fiscais" },
  { "codigo": "4.8.10", "descricao": "Multa Atraso Pagto Tributos" },
  { "codigo": "4.8.11", "descricao": "CRF Sobre Serviço" },

  // ── 4.9 PATROCÍNIO / BONIFICAÇÃO ─────────────────────────────────────────────
  { "codigo": "4.9",   "descricao": "PATROCÍNIO / BONIFICAÇÃO" },
  { "codigo": "4.9.1", "descricao": "Patrocínio em Dinheiro" },
  { "codigo": "4.9.2", "descricao": "Bonificação em Produtos" },

  { "codigo": "HEADER", "descricao": "Total das Despesas Operacionais" },
  { "codigo": "HEADER", "descricao": "Saldo Operacional Liquido" },

  // ══════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 5 — Receitas Não Operacionais Totais  (já usava 5.x — mantido)
  // ══════════════════════════════════════════════════════════════════════════════
  { "codigo": "HEADER", "descricao": "Receitas Não Operacionais Totais" },

  { "codigo": "5.1",   "descricao": "Receita de Empréstimo" },
  { "codigo": "5.1.1", "descricao": "Bancário" },
  { "codigo": "5.1.2", "descricao": "Financiamento" },
  { "codigo": "5.1.3", "descricao": "Entre Lojas do Grupo" },
  { "codigo": "5.1.4", "descricao": "Pessoa Física" },

  { "codigo": "5.2",   "descricao": "Receita de Investimento" },
  { "codigo": "5.2.1", "descricao": "Venda de Imóveis/terrenos" },
  { "codigo": "5.2.2", "descricao": "Venda de Veículos" },
  { "codigo": "5.2.3", "descricao": "Resgate de Titulo de Capitalização" },
  { "codigo": "5.2.4", "descricao": "Resgate de Consórcio" },
  { "codigo": "5.2.5", "descricao": "Venda de Ativo Imobilizado" },
  { "codigo": "5.2.6", "descricao": "Rendimentos CDB/Fundos/Alugueis" },
  { "codigo": "5.2.7", "descricao": "Resgate de Capital Social" },
  { "codigo": "5.2.8", "descricao": "Investimento Empresas do Mesmo Grupo" },
  { "codigo": "5.2.9", "descricao": "Aporte de Capital Social" },

  { "codigo": "5.3",    "descricao": "Receitas Financeiras" },
  { "codigo": "5.3.1",  "descricao": "Juros e Multas Recebidos" },
  { "codigo": "5.3.2",  "descricao": "Sobra Acerto Caixa" },
  { "codigo": "5.3.3",  "descricao": "Descontos Obtidos" },
  { "codigo": "5.3.4",  "descricao": "Outras Receitas Financeiras" },
  { "codigo": "5.3.5",  "descricao": "Receita de Brinde e Expositores" },
  { "codigo": "5.3.7",  "descricao": "Receita Não Identificada" },
  { "codigo": "5.3.8",  "descricao": "Despesas Não Identificadas ( - )" },
  { "codigo": "5.3.9",  "descricao": "Patrocínio em Dinheiro" },
  { "codigo": "5.3.10", "descricao": "Bonificação em Produtos" },

  // ══════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 6 — Despesas Não Operacional  (já usava 6.x — mantido)
  // ══════════════════════════════════════════════════════════════════════════════
  { "codigo": "HEADER", "descricao": "Despesas Não Operacional" },

  { "codigo": "6.1",    "descricao": "EMPRESTIMO / FINANCIAMENTO" },
  { "codigo": "6.1.1",  "descricao": "Bancarios" },
  { "codigo": "6.1.2",  "descricao": "Financiamento" },
  { "codigo": "6.1.3",  "descricao": "Entre Empresas do Mesmo Grupo" },
  { "codigo": "6.1.4",  "descricao": "Pessoa Fisica" },

  { "codigo": "6.2",    "descricao": "DESPESA COM INVESTIMENTO" },
  { "codigo": "6.2.1",  "descricao": "Imóveis" },
  { "codigo": "6.2.2",  "descricao": "Construcao e Ampliações Estrutura" },
  { "codigo": "6.2.3",  "descricao": "Leasing" },
  { "codigo": "6.2.4",  "descricao": "Compra de Terrenos" },
  { "codigo": "6.2.6",  "descricao": "Aquisicao Titulo de Capitalizacao" },
  { "codigo": "6.2.7",  "descricao": "Consorcios" },
  { "codigo": "6.2.8",  "descricao": "Investim Novas Empresas e Filiais" },
  { "codigo": "6.2.14", "descricao": "Frete Compra Ativo Imobilizado" },
  { "codigo": "6.2.15", "descricao": "Aquisicao de Novo Software Informatica" },
  { "codigo": "6.2.16", "descricao": "Participacao Sociedade Cooperativa" },
  { "codigo": "6.2.17", "descricao": "Devolução de Capital Investido" },

  { "codigo": "6.3",   "descricao": "INVESTIMENTO EM IMOBILIZADOS" },
  { "codigo": "6.3.1", "descricao": "Moveis e Utensil. Imobilizados" },
  { "codigo": "6.3.2", "descricao": "Maquinas e Equipam. Imobilizados" },
  { "codigo": "6.3.3", "descricao": "Equip. Informatica Imobilizados" },
  { "codigo": "6.3.5", "descricao": "Aquisicao de Veiculo Pesado - Imob" },
  { "codigo": "6.3.6", "descricao": "Aquisicao de Outros Veiculos - Imob" },

  { "codigo": "6.4",   "descricao": "DISTRIBUIÇÃO DE LUCROS E RESULTADOS" },
  { "codigo": "6.4.1", "descricao": "Distribuicao de Lucros Socios" },
  { "codigo": "6.4.2", "descricao": "Combust e Lubrificant - Diretoria" },
  { "codigo": "6.4.3", "descricao": "Viagens e Estadas - Diretoria" },
  { "codigo": "6.4.4", "descricao": "Distribuição de Lucros e Resultados" },

  { "codigo": "HEADER", "descricao": "Total das Despesas Não Operacional" },
  { "codigo": "HEADER", "descricao": "Saldo Inicial Conta Movimento" },
  { "codigo": "HEADER", "descricao": "Total Receitas Operac. e Não Operac." },
  { "codigo": "HEADER", "descricao": "Total Despesas Operac. e Não Operac." },
  { "codigo": "HEADER", "descricao": "Saldo Liquido Final" },
  { "codigo": "HEADER", "descricao": "Saldo Liquido Ajustado" },

  // ══════════════════════════════════════════════════════════════════════════════
  // SEÇÃO 7 — Disponíveis nas Contas Movimento final
  //   Mesmos códigos da seção 1 (contas bancárias reais, todas com 1.x)
  // ══════════════════════════════════════════════════════════════════════════════
  { "codigo": "HEADER", "descricao": "Disponíveis nas Contas Movimento final" },

  { "codigo": "1.0",    "descricao": "TESOURARIA MATRIZ PALMAS" },
  { "codigo": "1.1",    "descricao": "BANCO DO BRASIL C.C.60409-7 MATRIZ" },
  { "codigo": "1.2",    "descricao": "BRADESCO 15232-3 MATRIZ" },
  { "codigo": "1.3",    "descricao": "BANCO STONE MATRIZ C.C 40256726-7" },
  { "codigo": "1.4",    "descricao": "BANCO DA AMAZONIA 071730-7 MATRIZ" },
  { "codigo": "1.5",    "descricao": "ITAU C.C.98671-6 MATRIZ" },
  { "codigo": "1.5.03", "descricao": "ITAU C.C 83290-2 GARANTIDA" },
  { "codigo": "1.9",    "descricao": "CONTA PERDA/ROUBO/BONIFICAÇÃO E DOAÇÃO" },

  { "codigo": "1.21",   "descricao": "BANCO DO BRASIL C.C.60638-3 FILIAL PALMAS" },
  { "codigo": "1.24",   "descricao": "ITAU C.C.98669-0 FILIAL PALMAS" },
  { "codigo": "1.29",   "descricao": "CONTA PERDA/ROUBO E BONIFICAÇÃO FILIAL" },

  { "codigo": "1.40",   "descricao": "TESOURARIA FILIAL PORTO" },
  { "codigo": "1.41",   "descricao": "BANCO DO BRASIL C.C.61105-0 FILIAL PORTO" },
  { "codigo": "1.44",   "descricao": "MERCADO PAGO PIX FILIAL PORTO" },
  { "codigo": "1.49",   "descricao": "CONTA PERDA/ROUBO E BONIFICAÇÃO FILIAL" },

  { "codigo": "1.91",   "descricao": "CARTÃO ENDERED 5099+4596+6933+8072 - ESCRITORIO" }
];
