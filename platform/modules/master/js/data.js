window.mockTenants = [
    // ─── PRODUÇÃO ────────────────────────────────────────────────────────────
    {
        id: 'parreira',
        name: 'Parreira Sistemas',
        cnpj: '00.000.000/0001-00',
        slug: 'parreira',
        modules: ['master', 'dispatch', 'erp', 'erp-consultoria', 'wms', 'wms-coletor', 'sales-force'],
        status: 'active',
        adminEmail: 'paulo@parreirasistemas.com.br'
    },
    {
        id: 'ltdistribuidora',
        name: 'LT Distribuidora Peças Motos',
        cnpj: '08.747.452/0001-43',
        slug: 'ltdistribuidora',
        modules: ['dispatch'],
        status: 'active',
        adminEmail: 'contato@ltdistribuidora.com.br'
    },
    {
        id: 'centralpecas',
        name: 'Central Peças',
        cnpj: '12.987.654/0001-11',
        slug: 'centralpecas',
        adminEmail: 'admin@centralpecas.com.br',
        modules: ['dispatch'],
        status: 'active',
        createdAt: '2026-01-31'
    },
    {
        id: 'parreiralog',
        name: 'ParreiraLog',
        cnpj: '',
        slug: 'parreiralog',
        modules: ['dispatch'],
        status: 'active'
    },
    {
        id: 'altafix',
        name: 'Altafix',
        cnpj: '',
        slug: 'altafix',
        modules: ['dispatch'],
        status: 'active'
    },

    // ─── HOMOLOGAÇÃO (_hml) ──────────────────────────────────────────────────
    {
        id: 'parreira_hml',
        name: 'Parreira Sistemas [HML]',
        cnpj: '00.000.000/0001-00',
        slug: 'parreira',
        modules: ['master', 'dispatch', 'erp', 'erp-consultoria', 'wms', 'wms-coletor', 'sales-force'],
        status: 'active',
        adminEmail: 'paulo@parreirasistemas.com.br'
    },
    {
        id: 'ltdistribuidora_hml',
        name: 'LT Distribuidora [HML]',
        cnpj: '08.747.452/0001-43',
        slug: 'ltdistribuidora',
        modules: ['dispatch'],
        status: 'active',
        adminEmail: 'contato@ltdistribuidora.com.br'
    },
    {
        id: 'parreiralog_hml',
        name: 'ParreiraLog [HML]',
        cnpj: '',
        slug: 'parreiralog',
        modules: ['dispatch'],
        status: 'active'
    },
    {
        id: 'altafix_hml',
        name: 'Altafix [HML]',
        cnpj: '',
        slug: 'altafix',
        modules: ['dispatch'],
        status: 'active'
    }

];
