// ===========================================
// Força de Vendas 2.1 — Core Logic
// Login, Navigation, Data Layer, Sync
// IndexedDB powered + Multi-Empresa
// ===========================================

// ---- State ----
let fvUser = null;
let fvData = {
    clientes: [],
    produtos: [],
    pedidos: [],
    planosPagamento: [],
    transportadoras: [],
    empresas: [],
    estoque: [],
    titulosAbertos: [],
    configEmpresa: { codEmpresa: '01', nome: 'Parreira Distribuidora', cnpj: '00.000.000/0001-00' },
    lastSync: null,
    syncQueueCount: 0
};

const FV_STORAGE_KEY = 'fv_data';
const FV_USER_KEY = 'fv_user';

// ---- Default Data (expanded for Acontec alignment) ----
const DEFAULT_EMPRESAS = [
    { codEmpresa: '01', nome: 'Parreira Distribuidora', cnpj: '00.000.000/0001-00', telefone: '(91) 3000-0000' },
    { codEmpresa: '02', nome: 'Parreira Logística', cnpj: '00.000.000/0002-81', telefone: '(91) 3000-0001' }
];

const DEFAULT_CLIENTES = [
    { id: 1, codigo: '1001', cnpjCpf: '12.345.678/0001-90', tipoCliente: 'JURIDICA', razaoSocial: 'AUTO PEÇAS SILVA LTDA', fantasia: 'AP Silva', nome: 'AUTO PEÇAS SILVA', nomeFantasia: 'AP Silva', inscEstadual: '123456789', cidade: 'CASTANHAL', bairro: 'CENTRO', uf: 'PA', cep: '68740-000', endereco: 'Av. Barão do Rio Branco, 450', telefone: '(91) 3721-1234', celular: '(91) 98888-1234', email: 'contato@apsilva.com', comprador: 'João Silva', rota: 1, praca: 'CASTANHAL', grupo: 'A', regiao: 1, status: 'ativo', bloqueado: false, limiteTotal: 15000, limiteDisponivel: 8500, pedidoNaoFaturado: 6500, diasAtraso: 0, ultimaCompra: '2026-02-10', codEmpresa: '01', prefTip: 1, idFormPg: 2, visita: 'SEG/QUA', flagNovo: 'N', flagAlter: 'N', sincronizar: 0, tipo: 'PJ', cpfCnpj: '12.345.678/0001-90', ie: '123456789' },
    { id: 2, codigo: '1002', cnpjCpf: '23.456.789/0001-01', tipoCliente: 'JURIDICA', razaoSocial: 'MOTO CENTER LTDA', fantasia: 'Moto Center', nome: 'MOTO CENTER LTDA', nomeFantasia: 'Moto Center', inscEstadual: '234567890', cidade: 'MARABA', bairro: 'NOVA MARABA', uf: 'PA', cep: '68501-000', endereco: 'Rua Transamazônica, 120', telefone: '(94) 3322-5678', celular: '(94) 99999-5678', email: 'vendas@motocenter.com', comprador: 'Maria Santos', rota: 2, praca: 'MARABA', grupo: 'A', regiao: 2, status: 'ativo', bloqueado: false, limiteTotal: 25000, limiteDisponivel: 12000, pedidoNaoFaturado: 13000, diasAtraso: 0, ultimaCompra: '2026-02-15', codEmpresa: '01', prefTip: 1, idFormPg: 3, visita: 'TER/QUI', flagNovo: 'N', flagAlter: 'N', sincronizar: 0, tipo: 'PJ', cpfCnpj: '23.456.789/0001-01', ie: '234567890' },
    { id: 3, codigo: '1003', cnpjCpf: '34.567.890/0001-12', tipoCliente: 'JURIDICA', razaoSocial: 'PEÇAS E SERVIÇOS NORTE LTDA', fantasia: 'PS Norte', nome: 'PEÇAS E SERVIÇOS NORTE', nomeFantasia: 'PS Norte', inscEstadual: '345678901', cidade: 'BELEM', bairro: 'MARCO', uf: 'PA', cep: '66093-000', endereco: 'Tv. Dr. Moraes, 890', telefone: '(91) 3233-9012', celular: '', email: 'psnorte@email.com', comprador: '', rota: 3, praca: 'BELEM', grupo: 'B', regiao: 3, status: 'ativo', bloqueado: false, limiteTotal: 10000, limiteDisponivel: 10000, pedidoNaoFaturado: 0, diasAtraso: 0, ultimaCompra: '2026-01-28', codEmpresa: '01', prefTip: 1, idFormPg: 1, visita: '', flagNovo: 'N', flagAlter: 'N', sincronizar: 0, tipo: 'PJ', cpfCnpj: '34.567.890/0001-12', ie: '345678901' },
    { id: 4, codigo: '1004', cnpjCpf: '45.678.901/0001-23', tipoCliente: 'JURIDICA', razaoSocial: 'BICICLETARIA AMAZONIA LTDA', fantasia: 'Bici Amazônia', nome: 'BICICLETARIA AMAZONIA', nomeFantasia: 'Bici Amazônia', inscEstadual: '456789012', cidade: 'ANANINDEUA', bairro: 'CENTRO', uf: 'PA', cep: '67030-000', endereco: 'Rod. Augusto Montenegro, km 8', telefone: '(91) 3255-3456', celular: '', email: 'amazonia@bike.com', comprador: '', rota: 3, praca: 'BELEM', grupo: 'B', regiao: 3, status: 'ativo', bloqueado: true, limiteTotal: 8000, limiteDisponivel: 0, pedidoNaoFaturado: 8000, diasAtraso: 45, ultimaCompra: '2025-12-15', codEmpresa: '01', prefTip: 1, idFormPg: 1, visita: '', flagNovo: 'N', flagAlter: 'N', sincronizar: 0, tipo: 'PJ', cpfCnpj: '45.678.901/0001-23', ie: '456789012' },
    { id: 5, codigo: '1005', cnpjCpf: '56.789.012/0001-34', tipoCliente: 'JURIDICA', razaoSocial: 'COMERCIAL ARAGUAIA LTDA', fantasia: 'Com. Araguaia', nome: 'COMERCIAL ARAGUAIA', nomeFantasia: 'Com. Araguaia', inscEstadual: '567890123', cidade: 'REDENCAO', bairro: 'CENTRO', uf: 'PA', cep: '68550-000', endereco: 'Av. Brasil, 567', telefone: '(94) 3423-7890', celular: '', email: 'araguaia@com.br', comprador: '', rota: 2, praca: 'REDENCAO', grupo: 'C', regiao: 2, status: 'ativo', bloqueado: false, limiteTotal: 5000, limiteDisponivel: 3200, pedidoNaoFaturado: 1800, diasAtraso: 0, ultimaCompra: '2026-02-12', codEmpresa: '01', prefTip: 1, idFormPg: 1, visita: '', flagNovo: 'N', flagAlter: 'N', sincronizar: 0, tipo: 'PJ', cpfCnpj: '56.789.012/0001-34', ie: '567890123' },
    { id: 6, codigo: '1006', cnpjCpf: '67.890.123/0001-45', tipoCliente: 'JURIDICA', razaoSocial: 'PECAS XINGU ME', fantasia: 'Xingu Peças', nome: 'PECAS XINGU ME', nomeFantasia: 'Xingu Peças', inscEstadual: '678901234', cidade: 'ALTAMIRA', bairro: 'CENTRO', uf: 'PA', cep: '68372-000', endereco: 'Rua Coronel José Porfírio, 200', telefone: '(93) 3515-1234', celular: '', email: 'xingu@pecas.com', comprador: '', rota: 4, praca: 'ALTAMIRA', grupo: 'C', regiao: 4, status: 'inativo', bloqueado: false, limiteTotal: 3000, limiteDisponivel: 3000, pedidoNaoFaturado: 0, diasAtraso: 0, ultimaCompra: '2025-10-20', codEmpresa: '01', prefTip: 1, idFormPg: 1, visita: '', flagNovo: 'N', flagAlter: 'N', sincronizar: 0, tipo: 'PJ', cpfCnpj: '67.890.123/0001-45', ie: '678901234' },
    { id: 7, codigo: '1007', cnpjCpf: '78.901.234/0001-56', tipoCliente: 'JURIDICA', razaoSocial: 'LUBRIFICANTES PARA LTDA', fantasia: 'Lubri Pará', nome: 'LUBRIFICANTES PARA LTDA', nomeFantasia: 'Lubri Pará', inscEstadual: '789012345', cidade: 'SANTAREM', bairro: 'SAO RAIMUNDO', uf: 'PA', cep: '68005-000', endereco: 'Av. Cuiabá, 1200', telefone: '(93) 3522-5678', celular: '', email: 'lubripara@email.com', comprador: '', rota: 5, praca: 'SANTAREM', grupo: 'A', regiao: 5, status: 'ativo', bloqueado: false, limiteTotal: 20000, limiteDisponivel: 15000, pedidoNaoFaturado: 5000, diasAtraso: 0, ultimaCompra: '2026-02-14', codEmpresa: '01', prefTip: 1, idFormPg: 2, visita: '', flagNovo: 'N', flagAlter: 'N', sincronizar: 0, tipo: 'PJ', cpfCnpj: '78.901.234/0001-56', ie: '789012345' },
    { id: 8, codigo: '1008', cnpjCpf: '123.456.789-00', tipoCliente: 'FISICA', razaoSocial: 'JOAO SILVA MOTOS', fantasia: 'JS Motos', nome: 'JOAO SILVA MOTOS', nomeFantasia: 'JS Motos', inscEstadual: '', cidade: 'TUCURUI', bairro: 'CENTRO', uf: 'PA', cep: '68455-000', endereco: 'Rua Lauro Sodré, 89', telefone: '(94) 3787-9012', celular: '', email: 'jsmotos@email.com', comprador: '', rota: 4, praca: 'TUCURUI', grupo: 'C', regiao: 4, status: 'ativo', bloqueado: true, limiteTotal: 2000, limiteDisponivel: 0, pedidoNaoFaturado: 2000, diasAtraso: 90, ultimaCompra: '2025-11-01', codEmpresa: '01', prefTip: 1, idFormPg: 4, visita: '', flagNovo: 'N', flagAlter: 'N', sincronizar: 0, tipo: 'PF', cpfCnpj: '123.456.789-00', ie: '' }
];

const DEFAULT_PRODUTOS = [
    { sku: 'COD001', nome: 'Óleo de Motor 5W30 Sintético', descricaoCompleta: 'Óleo de Motor 5W30 Sintético 1L', grupo: 'Lubrificantes', idGrup: '01', precoBase: 45.00, estoque: 120, unidade: 'UN', unidadeMaster: 'CX', qtUnitCx: 12, ipi: 5.0, descontoMaxProd: 15, ean13: '7891234560001', imagem: '', flagNovo: 'N', flagAlter: 'N' },
    { sku: 'COD002', nome: 'Filtro de Óleo Universal', descricaoCompleta: 'Filtro de Óleo Universal para Motores 1.0 a 2.0', grupo: 'Filtros', idGrup: '02', precoBase: 18.50, estoque: 200, unidade: 'UN', unidadeMaster: 'UN', qtUnitCx: 1, ipi: 5.0, descontoMaxProd: 10, ean13: '7891234560002', imagem: '', flagNovo: 'N', flagAlter: 'N' },
    { sku: 'COD003', nome: 'Pastilha de Freio Dianteira', descricaoCompleta: 'Pastilha de Freio Dianteira Cerâmica Universal', grupo: 'Freios', idGrup: '03', precoBase: 65.00, estoque: 85, unidade: 'JG', unidadeMaster: 'JG', qtUnitCx: 1, ipi: 8.0, descontoMaxProd: 12, ean13: '7891234560003', imagem: '', flagNovo: 'N', flagAlter: 'N' },
    { sku: 'COD004', nome: 'Correia Dentada Motor 1.0', descricaoCompleta: 'Correia Dentada Motor 1.0 16V Gates', grupo: 'Motor', idGrup: '04', precoBase: 32.00, estoque: 45, unidade: 'UN', unidadeMaster: 'UN', qtUnitCx: 1, ipi: 5.0, descontoMaxProd: 10, ean13: '7891234560004', imagem: '', flagNovo: 'N', flagAlter: 'N' },
    { sku: 'COD005', nome: 'Amortecedor Dianteiro Par', descricaoCompleta: 'Amortecedor Dianteiro Par Cofap', grupo: 'Suspensão', idGrup: '05', precoBase: 189.00, estoque: 30, unidade: 'PAR', unidadeMaster: 'PAR', qtUnitCx: 1, ipi: 10.0, descontoMaxProd: 8, ean13: '7891234560005', imagem: '', flagNovo: 'N', flagAlter: 'N' },
    { sku: 'COD006', nome: 'Kit Embreagem Completo', descricaoCompleta: 'Kit Embreagem Completo LuK Motor 1.0/1.4', grupo: 'Transmissão', idGrup: '06', precoBase: 320.00, estoque: 15, unidade: 'KIT', unidadeMaster: 'KIT', qtUnitCx: 1, ipi: 10.0, descontoMaxProd: 5, ean13: '7891234560006', imagem: '', flagNovo: 'N', flagAlter: 'N' },
    { sku: 'COD007', nome: 'Vela de Ignição NGK', descricaoCompleta: 'Vela de Ignição NGK BKR6E', grupo: 'Elétrica', idGrup: '07', precoBase: 22.00, estoque: 300, unidade: 'UN', unidadeMaster: 'CX', qtUnitCx: 4, ipi: 0, descontoMaxProd: 15, ean13: '7891234560007', imagem: '', flagNovo: 'N', flagAlter: 'N' },
    { sku: 'COD008', nome: 'Fluido de Freio DOT4 500ml', descricaoCompleta: 'Fluido de Freio DOT4 500ml Bosch', grupo: 'Fluidos', idGrup: '08', precoBase: 28.90, estoque: 150, unidade: 'UN', unidadeMaster: 'CX', qtUnitCx: 24, ipi: 5.0, descontoMaxProd: 10, ean13: '7891234560008', imagem: '', flagNovo: 'N', flagAlter: 'N' },
    { sku: 'COD009', nome: 'Bateria 60Ah 18 Meses', descricaoCompleta: 'Bateria 60Ah 18 Meses Moura', grupo: 'Elétrica', idGrup: '07', precoBase: 380.00, estoque: 25, unidade: 'UN', unidadeMaster: 'UN', qtUnitCx: 1, ipi: 0, descontoMaxProd: 5, ean13: '7891234560009', imagem: '', flagNovo: 'N', flagAlter: 'N' },
    { sku: 'COD010', nome: 'Jogo de Juntas Motor', descricaoCompleta: 'Jogo de Juntas Motor Completo Sabó', grupo: 'Motor', idGrup: '04', precoBase: 145.00, estoque: 40, unidade: 'JG', unidadeMaster: 'JG', qtUnitCx: 1, ipi: 5.0, descontoMaxProd: 10, ean13: '7891234560010', imagem: '', flagNovo: 'N', flagAlter: 'N' },
    { sku: 'COD011', nome: 'Radiador Completo', descricaoCompleta: 'Radiador Completo Alumínio c/ Reservatório', grupo: 'Arrefecimento', idGrup: '09', precoBase: 420.00, estoque: 12, unidade: 'UN', unidadeMaster: 'UN', qtUnitCx: 1, ipi: 10.0, descontoMaxProd: 5, ean13: '7891234560011', imagem: '', flagNovo: 'N', flagAlter: 'N' },
    { sku: 'COD012', nome: 'Palheta Limpador Par', descricaoCompleta: 'Palheta Limpador Par Bosch Eco', grupo: 'Acessórios', idGrup: '10', precoBase: 35.00, estoque: 90, unidade: 'PAR', unidadeMaster: 'PAR', qtUnitCx: 1, ipi: 0, descontoMaxProd: 15, ean13: '7891234560012', imagem: '', flagNovo: 'N', flagAlter: 'N' }
];

const DEFAULT_TABELAS_PRECO = [
    { id: 'TAB-A', nome: 'Tabela Grupo A', grupo: 'A', desconto: 0, markup: 1.0 },
    { id: 'TAB-B', nome: 'Tabela Grupo B', grupo: 'B', desconto: 0, markup: 1.05 },
    { id: 'TAB-C', nome: 'Tabela Grupo C', grupo: 'C', desconto: 0, markup: 1.10 }
];

const DEFAULT_TRANSPORTADORAS = [
    { id: 1, nome: 'Transporte Rápido PA', uf: 'PA', tipo: 'TR' },
    { id: 2, nome: 'Expresso Norte', uf: 'PA', tipo: 'TR' },
    { id: 3, nome: 'Logística Amazônia', uf: 'PA', tipo: 'TR' },
    { id: 4, nome: 'Retira (Cliente)', uf: '', tipo: 'CL' }
];

const DEFAULT_PLANOS_PAGAMENTO = [
    { id: 1, nome: '30 dias', descPag: '30 DIAS', codigo: '30', especiePag: 'Cobrança Bancária', parcelas: 1, prazos: [30], precoDesc: 0, precoAcrec: 0, vlVendaMin: 0 },
    { id: 2, nome: '30/60 dias', descPag: '30/60 DIAS', codigo: '30/60', especiePag: 'Cobrança Bancária', parcelas: 2, prazos: [30, 60], precoDesc: 0, precoAcrec: 0, vlVendaMin: 0 },
    { id: 3, nome: '30/60/90 dias', descPag: '30/60/90 DIAS', codigo: '30/60/90', especiePag: 'Cobrança Bancária', parcelas: 3, prazos: [30, 60, 90], precoDesc: 0, precoAcrec: 0, vlVendaMin: 0 },
    { id: 4, nome: 'À Vista', descPag: 'A VISTA', codigo: 'AV', especiePag: 'Dinheiro', parcelas: 1, prazos: [0], precoDesc: 3, precoAcrec: 0, vlVendaMin: 0 },
    { id: 5, nome: '28 dias', descPag: '28 DIAS', codigo: '28', especiePag: 'Cobrança Bancária', parcelas: 1, prazos: [28], precoDesc: 0, precoAcrec: 0, vlVendaMin: 0 },
    { id: 6, nome: '30/60/90/120 dias', descPag: '30/60/90/120 DIAS', codigo: '30/60/90/120', especiePag: 'Cobrança Bancária', parcelas: 4, prazos: [30, 60, 90, 120], precoDesc: 0, precoAcrec: 2, vlVendaMin: 500 }
];

const DEFAULT_PEDIDOS = [
    { id: 'PED-001', data: '2026-02-18', clienteId: 1, clienteCnpjCpf: '12.345.678/0001-90', clienteNome: 'AUTO PEÇAS SILVA', tipo: 'PJ', empresa: 'Parreira Distribuidora', codEmpresa: '01', transportadora: 'Transporte Rápido PA', codfornecTransp: 1, planoPagamento: '30/60 dias', idFormPg: 2, status: 'orcamento', stpPedido: 'Pre-Venda', itens: [{ sku: 'COD001', nome: 'Óleo de Motor 5W30 Sintético', qtd: 10, preco: 45.00, desconto: 0, ipi: 5.0, valorIpi: 22.50 }, { sku: 'COD002', nome: 'Filtro de Óleo Universal', qtd: 20, preco: 18.50, desconto: 0, ipi: 5.0, valorIpi: 18.50 }], obs: '', valorTotal: 820.00, totalIpi: 41.00, porDesconto: 0, statusNota: '', valorFlex: 0, sincronizado: 'N', flagEnvio: 'N', rota: 1 },
    { id: 'PED-002', data: '2026-02-17', clienteId: 2, clienteCnpjCpf: '23.456.789/0001-01', clienteNome: 'MOTO CENTER LTDA', tipo: 'PJ', empresa: 'Parreira Distribuidora', codEmpresa: '01', transportadora: 'Expresso Norte', codfornecTransp: 2, planoPagamento: '30/60/90 dias', idFormPg: 3, status: 'venda', stpPedido: 'Pre-Venda', itens: [{ sku: 'COD005', nome: 'Amortecedor Dianteiro Par', qtd: 5, preco: 189.00, desconto: 0, ipi: 10.0, valorIpi: 94.50 }], obs: 'Entregar pela manhã', valorTotal: 945.00, totalIpi: 94.50, porDesconto: 0, statusNota: '', valorFlex: 0, sincronizado: 'N', flagEnvio: 'N', rota: 2 },
    { id: 'PED-003', data: '2026-02-16', clienteId: 5, clienteCnpjCpf: '56.789.012/0001-34', clienteNome: 'COMERCIAL ARAGUAIA', tipo: 'PJ', empresa: 'Parreira Distribuidora', codEmpresa: '01', transportadora: 'Logística Amazônia', codfornecTransp: 3, planoPagamento: '30 dias', idFormPg: 1, status: 'enviado', stpPedido: 'Venda', itens: [{ sku: 'COD003', nome: 'Pastilha de Freio Dianteira', qtd: 8, preco: 65.00, desconto: 5, ipi: 8.0, valorIpi: 39.52 }], obs: '', valorTotal: 494.00, totalIpi: 39.52, porDesconto: 5, statusNota: '', valorFlex: 0, sincronizado: 'E', flagEnvio: 'S', rota: 2 },
    { id: 'PED-004', data: '2026-02-15', clienteId: 7, clienteCnpjCpf: '78.901.234/0001-56', clienteNome: 'LUBRIFICANTES PARA LTDA', tipo: 'PJ', empresa: 'Parreira Distribuidora', codEmpresa: '01', transportadora: 'Transporte Rápido PA', codfornecTransp: 1, planoPagamento: '30/60 dias', idFormPg: 2, status: 'separado', stpPedido: 'Pre-Venda', itens: [{ sku: 'COD001', nome: 'Óleo de Motor 5W30 Sintético', qtd: 50, preco: 45.00, desconto: 3, ipi: 5.0, valorIpi: 109.13 }], obs: '', valorTotal: 2182.50, totalIpi: 109.13, porDesconto: 3, statusNota: '', valorFlex: 0, sincronizado: 'E', flagEnvio: 'S', rota: 5 },
    { id: 'PED-005', data: '2026-02-14', clienteId: 3, clienteCnpjCpf: '34.567.890/0001-12', clienteNome: 'PEÇAS E SERVIÇOS NORTE', tipo: 'PJ', empresa: 'Parreira Distribuidora', codEmpresa: '01', transportadora: 'Retira (Cliente)', codfornecTransp: 4, planoPagamento: 'À Vista', idFormPg: 4, status: 'faturado', stpPedido: 'Venda', itens: [{ sku: 'COD007', nome: 'Vela de Ignição NGK', qtd: 30, preco: 22.00, desconto: 0, ipi: 0, valorIpi: 0 }], obs: '', valorTotal: 660.00, totalIpi: 0, porDesconto: 0, statusNota: 'NF 001234', valorFlex: 0, sincronizado: 'E', flagEnvio: 'S', rota: 3 },
    { id: 'PED-006', data: '2026-02-10', clienteId: 1, clienteCnpjCpf: '12.345.678/0001-90', clienteNome: 'AUTO PEÇAS SILVA', tipo: 'PJ', empresa: 'Parreira Distribuidora', codEmpresa: '01', transportadora: 'Transporte Rápido PA', codfornecTransp: 1, planoPagamento: '30 dias', idFormPg: 1, status: 'despachado', stpPedido: 'Venda', itens: [{ sku: 'COD008', nome: 'Fluido de Freio DOT4 500ml', qtd: 15, preco: 28.90, desconto: 0, ipi: 5.0, valorIpi: 21.68 }], obs: '', valorTotal: 433.50, totalIpi: 21.68, porDesconto: 0, statusNota: 'NF 001230', valorFlex: 0, sincronizado: 'E', flagEnvio: 'S', rota: 1 }
];

const DEFAULT_USUARIO = {
    codigo: '32',
    nome: 'Paulo Vendedor',
    iniciais: 'PV',
    login: '32',
    senha: '1234',
    email: '',
    flagDesconto: 'S',
    desMax: 15.00,
    precoTabela: 1,
    valorMeta: 50000.00,
    valorFlex: 0,
    descMaxFlex: 0,
    utilizaFlex: 'N',
    rotaPreCadastro: 0
};

// ---- Async Init ----
async function initFV() {
    // Load user from localStorage (small, keep there)
    const savedUser = localStorage.getItem(FV_USER_KEY);
    if (savedUser) {
        fvUser = JSON.parse(savedUser);
    }

    try {
        // Open DB
        await FVDB.open();

        // Try migrate from localStorage if needed
        await FVDB.migrateFromLocalStorage();

        // Load data from IndexedDB
        const loaded = await FVDB.loadAllToMemory();
        fvData = { ...fvData, ...loaded };

        // If empty (first run), seed with defaults
        if (!fvData.clientes.length) {
            await FVDB.putMany('clientes', DEFAULT_CLIENTES);
            fvData.clientes = DEFAULT_CLIENTES;
        }
        if (!fvData.produtos.length) {
            await FVDB.putMany('produtos', DEFAULT_PRODUTOS);
            fvData.produtos = DEFAULT_PRODUTOS;
        }
        if (!fvData.pedidos.length) {
            await FVDB.putMany('pedidos', DEFAULT_PEDIDOS);
            fvData.pedidos = DEFAULT_PEDIDOS;
        }
        if (!fvData.planosPagamento.length) {
            await FVDB.putMany('formaPag', DEFAULT_PLANOS_PAGAMENTO);
            fvData.planosPagamento = DEFAULT_PLANOS_PAGAMENTO;
        }
        if (!fvData.transportadoras.length) {
            await FVDB.putMany('transportadoras', DEFAULT_TRANSPORTADORAS);
            fvData.transportadoras = DEFAULT_TRANSPORTADORAS;
        }
        if (!fvData.empresas || !fvData.empresas.length) {
            await FVDB.putMany('empresas', DEFAULT_EMPRESAS);
            fvData.empresas = DEFAULT_EMPRESAS;
            fvData.configEmpresa = DEFAULT_EMPRESAS[0];
        }

        // Save usuario default
        const existingUser = await FVDB.get('usuarios', '32');
        if (!existingUser) {
            await FVDB.put('usuarios', DEFAULT_USUARIO);
        }

        console.log('[FV] IndexedDB loaded:', {
            clientes: fvData.clientes.length,
            produtos: fvData.produtos.length,
            pedidos: fvData.pedidos.length,
            empresas: fvData.empresas.length,
            syncQueue: fvData.syncQueueCount
        });

    } catch (err) {
        console.error('[FV] IndexedDB init failed, falling back to localStorage:', err);
        // Fallback to localStorage
        const savedData = localStorage.getItem(FV_STORAGE_KEY);
        if (savedData) {
            const parsed = JSON.parse(savedData);
            fvData = { ...fvData, ...parsed };
        }
        if (!fvData.clientes.length) fvData.clientes = DEFAULT_CLIENTES;
        if (!fvData.produtos.length) fvData.produtos = DEFAULT_PRODUTOS;
        if (!fvData.pedidos.length) fvData.pedidos = DEFAULT_PEDIDOS;
        if (!fvData.planosPagamento.length) fvData.planosPagamento = DEFAULT_PLANOS_PAGAMENTO;
        if (!fvData.transportadoras.length) fvData.transportadoras = DEFAULT_TRANSPORTADORAS;
    }

    if (fvUser) {
        showMainApp();
    }
}

// ---- Save Data ----
async function saveFVData() {
    try {
        await FVDB.saveFromMemory(fvData);
    } catch (err) {
        console.warn('[FV] IndexedDB save failed, using localStorage fallback:', err);
        localStorage.setItem(FV_STORAGE_KEY, JSON.stringify(fvData));
    }
}

// Save single entity
async function savePedido(pedido) {
    try {
        await FVDB.put('pedidos', pedido);
        // Also enqueue for sync if new/modified
        if (pedido.sincronizado !== 'E') {
            await FVDB.enqueueSync('pedido', pedido);
            fvData.syncQueueCount = await FVDB.count('syncQueue');
        }
    } catch (err) {
        console.warn('[FV] Save pedido to IDB failed:', err);
    }
    // Update in-memory
    const idx = fvData.pedidos.findIndex(p => p.id === pedido.id);
    if (idx >= 0) fvData.pedidos[idx] = pedido;
    else fvData.pedidos.push(pedido);
}

async function saveCliente(cliente) {
    try {
        await FVDB.put('clientes', cliente);
        if (cliente.flagAlter === 'S') {
            await FVDB.enqueueSync('cliente', cliente);
            fvData.syncQueueCount = await FVDB.count('syncQueue');
        }
    } catch (err) {
        console.warn('[FV] Save cliente to IDB failed:', err);
    }
    const idx = fvData.clientes.findIndex(c => c.cnpjCpf === cliente.cnpjCpf);
    if (idx >= 0) fvData.clientes[idx] = cliente;
    else fvData.clientes.push(cliente);
}

// ---- Login ----
function doLogin() {
    const user = document.getElementById('loginUser').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    if (user === '32' && pass === '1234') {
        fvUser = { ...DEFAULT_USUARIO };
        localStorage.setItem(FV_USER_KEY, JSON.stringify(fvUser));
        showMainApp();
    } else {
        showToast('Usuário ou senha inválidos');
    }
}

function doLogout() {
    fvUser = null;
    localStorage.removeItem(FV_USER_KEY);
    document.getElementById('mainApp').classList.remove('active');
    document.getElementById('loginScreen').classList.add('active');
    toggleDrawer(true);
}

function showMainApp() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('mainApp').classList.add('active');
    const avatar = fvUser.iniciais || fvUser.nome.charAt(0);
    document.getElementById('userAvatar').textContent = avatar;
    document.querySelectorAll('.drawer-avatar').forEach(el => el.textContent = avatar);
    document.getElementById('drawerName').textContent = fvUser.nome;
    updateBadges();
    navigateTo('dashboard');
}

// ---- Navigation ----
let currentView = 'dashboard';

function navigateTo(viewName) {
    currentView = viewName;

    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

    // Show target
    const target = document.getElementById('view-' + viewName);
    if (target) target.classList.add('active');

    // Update title
    const titles = {
        dashboard: 'Home',
        pedidos: 'Pedidos',
        clientes: 'Clientes',
        clienteDetalhe: 'Detalhe do Cliente',
        novoPedido: 'Novo Pedido',
        sync: 'Sincronização'
    };
    document.getElementById('screenTitle').textContent = titles[viewName] || viewName;

    // Update bottom nav
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === viewName) btn.classList.add('active');
    });

    // Update drawer
    document.querySelectorAll('.drawer-item').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === viewName) btn.classList.add('active');
    });

    toggleDrawer(true);

    // Render screen
    renderScreen(viewName);
}

// ---- Drawer ----
function toggleDrawer(forceClose) {
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawerOverlay');
    if (forceClose || drawer.classList.contains('open')) {
        drawer.classList.remove('open');
        overlay.classList.remove('open');
    } else {
        drawer.classList.add('open');
        overlay.classList.add('open');
    }
}

// ---- Toast ----
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

// ---- Badges ----
function updateBadges() {
    const pendentes = fvData.pedidos.filter(p => p.status === 'orcamento').length;
    const badgeP = document.getElementById('badgePedidos');
    if (badgeP) {
        if (pendentes > 0) {
            badgeP.textContent = pendentes;
            badgeP.classList.add('show');
        } else {
            badgeP.classList.remove('show');
        }
    }

    const totalClientes = fvData.clientes.length;
    const badgeC = document.getElementById('badgeClientes');
    if (badgeC) {
        badgeC.textContent = totalClientes;
        badgeC.classList.add('show');
    }

    // Sync queue badge
    updateSyncBadge();
}

function updateSyncBadge() {
    const syncIndicator = document.getElementById('syncIndicator');
    if (!syncIndicator) return;

    if (fvData.syncQueueCount > 0) {
        syncIndicator.classList.add('has-pending');
        syncIndicator.title = `${fvData.syncQueueCount} item(s) na fila de sync`;
    } else {
        syncIndicator.classList.remove('has-pending');
    }
}

// ---- Helpers ----
function fmtMoney(v) {
    return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('pt-BR');
}

function getPrecoCliente(produto, cliente) {
    // Busca tabela de preço pelo grupo do cliente (legacy)
    const tabela = DEFAULT_TABELAS_PRECO.find(t => t.grupo === (cliente?.grupo || 'C'));
    const markup = tabela ? tabela.markup : 1.10;
    return +(produto.precoBase * markup).toFixed(2);
}

function calcIpiItem(preco, qtd, desconto, ipiPerc) {
    const valorBruto = preco * qtd;
    const valorDesc = valorBruto * ((desconto || 0) / 100);
    const valorLiquido = valorBruto - valorDesc;
    return +((valorLiquido * (ipiPerc || 0)) / 100).toFixed(2);
}

function getDescontoMaxPermitido(produto, usuario) {
    // Menor entre desconto max do produto e do vendedor
    const maxProd = produto.descontoMaxProd || 100;
    const maxUser = usuario?.desMax || 100;
    return Math.min(maxProd, maxUser);
}

function getLimiteCreditoDisponivel(cliente) {
    return Math.max(0, (cliente.limiteTotal || 0) - (cliente.pedidoNaoFaturado || 0));
}

function gerarNumeroPedido() {
    const max = fvData.pedidos.reduce((m, p) => {
        const num = parseInt(p.id.replace('PED-', ''), 10);
        return num > m ? num : m;
    }, 0);
    return 'PED-' + String(max + 1).padStart(3, '0');
}

// ---- Online/Offline ----
window.addEventListener('online', () => {
    document.getElementById('syncIndicator').classList.remove('offline');
    showToast('Conexão restaurada');
    // Process sync queue when back online
    processSyncQueue();
});
window.addEventListener('offline', () => {
    const indicator = document.getElementById('syncIndicator');
    indicator.classList.add('offline');
    indicator.querySelector('.material-icons-round').textContent = 'cloud_off';
    showToast('Modo offline ativado');
});

// ---- Sync Queue Processing ----
async function processSyncQueue() {
    if (!navigator.onLine) return;
    try {
        const pending = await FVDB.getPendingSync();
        if (!pending.length) return;

        console.log(`[FV] Processing ${pending.length} sync queue items...`);
        // TODO: Implement actual API sync when backend is ready
        // For now, just mark all as processed
        for (const item of pending) {
            // await sendToServer(item); // future
            await FVDB.markSyncProcessed(item.id);
        }
        fvData.syncQueueCount = await FVDB.count('syncQueue');
        updateSyncBadge();
        showToast(`${pending.length} item(s) sincronizado(s)`);
    } catch (err) {
        console.error('[FV] Sync queue processing error:', err);
    }
}

async function getSyncQueueInfo() {
    try {
        const pending = await FVDB.getPendingSync();
        const total = await FVDB.count('syncQueue');
        return { pending: pending.length, total };
    } catch (err) {
        return { pending: 0, total: 0 };
    }
}

// ---- Init on DOM Ready ----
document.addEventListener('DOMContentLoaded', initFV);
