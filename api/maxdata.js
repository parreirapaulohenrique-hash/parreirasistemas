/**
 * api/maxdata.js — Vercel Serverless Proxy para API Maxdata
 * ===========================================================
 * Node.js 18+ com fetch global nativo. CommonJS (module.exports).
 * Resolve Mixed Content: browser HTTPS -> proxy HTTPS -> Maxdata HTTP.
 */

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Extrai _path, _apiUrl e monta o resto da query
    const url = new URL(req.url, 'http://localhost');
    const params = Object.fromEntries(url.searchParams.entries());
    const { _path, _apiUrl, ...rest } = params;
    const endpointPath = (_path || '').replace(/^\/+/, '');

    if (!endpointPath) {
        return res.status(400).json({ success: false, message: 'Parâmetro _path ausente.' });
    }

    // Monta lista de hosts candidatos
    const candidateHosts = [];

    // Se o frontend passou uma URL customizada / configurada pelo tenant
    if (_apiUrl) {
        let clean = decodeURIComponent(_apiUrl).trim().replace(/\/+$/, '');
        // Sanitiza erros comuns de digitação como .con.br -> .com.br
        clean = clean.replace(/\.con\.br/gi, '.com.br');
        if (clean && !candidateHosts.includes(clean)) {
            candidateHosts.push(clean);
        }
    }

    // Hosts padrão conhecidos (hostname primeiro, depois fallback via IP)
    const defaults = [
        'http://rds.skytins.com.br:8720/v2',
        'http://45.177.248.129:8720/v2'
    ];

    for (const h of defaults) {
        if (!candidateHosts.includes(h)) {
            candidateHosts.push(h);
        }
    }

    const qs = Object.keys(rest).length ? '?' + new URLSearchParams(rest).toString() : '';

    // Cabeçalhos para repassar (não forçamos Host manual para evitar conflitos no fetch)
    const headers = { 
        'Content-Type': 'application/json'
    };
    if (req.headers['authorization']) {
        headers['Authorization'] = req.headers['authorization'];
    }

    // Prepara body
    let body;
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        body = req.body
            ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
            : undefined;
    }

    let lastError = null;

    for (const base of candidateHosts) {
        const targetUrl = base + '/' + endpointPath + qs;
        console.log('[MaxDataProxy] Tentando: ' + req.method + ' ' + targetUrl);

        const ac = new AbortController();
        // 12s por tentativa (maxDuration é 30s)
        const timer = setTimeout(() => ac.abort(), 12000);

        try {
            const response = await fetch(targetUrl, {
                method: req.method,
                headers: headers,
                body: body,
                signal: ac.signal
            });

            clearTimeout(timer);

            const text = await response.text();
            let data;
            try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }

            console.log('[MaxDataProxy] Sucesso em ' + base + ': ' + response.status);
            return res.status(response.status).json(data);
        } catch (e) {
            clearTimeout(timer);
            console.warn('[MaxDataProxy] Falha ao tentar ' + base + ':', e.message);
            lastError = e;
        }
    }

    const errMsg = lastError ? lastError.message : 'Servidor não respondeu a tempo.';
    return res.status(504).json({
        success: false,
        message: 'Timeout ao conectar com a API MaxData: ' + errMsg
    });
};
