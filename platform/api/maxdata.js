/**
 * api/maxdata.js — Vercel Serverless Proxy para API Maxdata
 * ===========================================================
 * Node.js 18+ com fetch global nativo. CommonJS (module.exports).
 * Resolve Mixed Content: browser HTTPS -> proxy HTTPS -> Maxdata HTTP.
 * Inclui proteção contra SSRF e repasse dos headers de autenticação MaxData v2.
 */

function isHostAllowed(urlString) {
    try {
        const parsed = new URL(urlString);
        if (!['http:', 'https:'].includes(parsed.protocol)) return false;

        const hostname = parsed.hostname.toLowerCase();

        // Bloqueio rigoroso de endereços locais, de loopback e de metadados de nuvem
        if (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname === '0.0.0.0' ||
            hostname === '::1' ||
            hostname === '169.254.169.254' ||
            hostname.endsWith('.internal') ||
            hostname.endsWith('.local')
        ) {
            return false;
        }

        // Bloqueio de faixas privadas IPv4 (RFC 1918)
        const ipParts = hostname.split('.').map(Number);
        if (ipParts.length === 4 && ipParts.every(n => !isNaN(n) && n >= 0 && n <= 255)) {
            if (ipParts[0] === 10) return false;
            if (ipParts[0] === 127) return false;
            if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31) return false;
            if (ipParts[0] === 192 && ipParts[1] === 168) return false;
            if (ipParts[0] === 169 && ipParts[1] === 254) return false;
        }

        return true;
    } catch (_) {
        return false;
    }
}

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, application_name, application_key, application_description, X-CSRF-Token, X-Requested-With, Accept'
    );
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
        clean = clean.replace(/\.con\.br/gi, '.com.br');

        if (!isHostAllowed(clean)) {
            console.warn('[MaxDataProxy] Tentativa de acesso a host bloqueado (SSRF Guard):', clean);
            return res.status(403).json({
                success: false,
                message: 'Acesso bloqueado pelo sistema de segurança (SSRF Guard).'
            });
        }

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

    // Cabeçalhos para repassar à API do MaxData
    const headers = {
        'Content-Type': 'application/json'
    };

    const forwardHeaders = [
        'authorization',
        'application_name',
        'application_key',
        'application_description'
    ];

    forwardHeaders.forEach(h => {
        if (req.headers[h]) {
            headers[h] = req.headers[h];
        }
    });

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
