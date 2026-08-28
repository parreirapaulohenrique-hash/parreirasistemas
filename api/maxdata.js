/**
 * api/maxdata.js — Vercel Serverless Proxy para API Maxdata
 * ===========================================================
 * Node.js 18+ com fetch global nativo. CommonJS (module.exports).
 * Resolve Mixed Content: browser HTTPS → proxy HTTPS → Maxdata HTTP.
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

    const MAXDATA_BASE = 'http://rds.skytins.com.br:8720/v2';

    // Extrai _path e monta o resto da query
    const url = new URL(req.url, 'http://localhost');
    const params = Object.fromEntries(url.searchParams.entries());
    const { _path, ...rest } = params;
    const endpointPath = (_path || '').replace(/^\/+/, '');

    if (!endpointPath) {
        return res.status(400).json({ success: false, message: 'Parâmetro _path ausente.' });
    }

    const qs = Object.keys(rest).length ? '?' + new URLSearchParams(rest).toString() : '';
    const targetUrl = `${MAXDATA_BASE}/${endpointPath}${qs}`;

    console.log(`[MaxDataProxy] ${req.method} ${targetUrl}`);

    // Cabeçalhos para repassar
    const headers = { 'Content-Type': 'application/json' };
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

    // Abort controller para timeout de 8s (abaixo do limite de 10s do Vercel)
    const ac = new AbortController();
    const timer = setTimeout(() => {
        ac.abort();
    }, 8000);

    try {
        const response = await fetch(targetUrl, {
            method: req.method,
            headers,
            body,
            signal: ac.signal
        });

        clearTimeout(timer);

        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }

        console.log(`[MaxDataProxy] Resposta: ${response.status}`);
        return res.status(response.status).json(data);

    } catch (e) {
        clearTimeout(timer);

        if (e.name === 'AbortError') {
            console.error('[MaxDataProxy] Timeout (8s) ao conectar em:', targetUrl);
            return res.status(504).json({
                success: false,
                message: 'Timeout: o servidor Maxdata não respondeu em 8s. Verifique se a API está acessível na internet.'
            });
        }

        console.error('[MaxDataProxy] Erro de rede:', e.message, '->', targetUrl);
        return res.status(502).json({
            success: false,
            message: `Erro de rede no proxy: ${e.message}`
        });
    }
};
