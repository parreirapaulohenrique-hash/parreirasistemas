export const mockTenants = [
    {
        id: 't001',
        name: 'Parreira Logística Ltda',
        cnpj: '12.345.678/0001-90',
        adminEmail: 'paulo@parreiralog.com.br',
        modules: ['dispatch', 'wms'],
        status: 'active',
        createdAt: '2026-01-15'
    },
    {
        id: 't002',
        name: 'Transportadora Global SA',
        cnpj: '98.765.432/0001-10',
        adminEmail: 'contato@globaltrans.com',
        modules: ['dispatch'],
        status: 'active',
        createdAt: '2026-01-20'
    },
    {
        id: 't003',
        name: 'AgroSul Distribuição',
        cnpj: '45.123.789/0001-55',
        adminEmail: 'financeiro@agrosul.com',
        modules: ['erp', 'wms', 'dispatch'],
        status: 'pending',
        createdAt: '2026-01-30'
    }
];
