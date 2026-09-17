/**
 * api/maxdata.js — Vercel Serverless Proxy para API MaxData
 * ========================================================
 * Permite que a aplicação Vercel (HTTPS) consulte a API do MaxData (HTTP)
 * sem restrições de Mixed Content ou CORS impostas pelos navegadores.
 */

module.exports = async (req, res) => {
    // Cabeçalhos CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const query = Object.assign({}, req.query);
        const path = query._path || '';
        const apiUrl = (query._apiUrl || 'http://rds.skytins.com.br:8720/v2').replace(/\/+$/, '');
        delete query._path;
        delete query._apiUrl;

        const urlObj = new URL(`${apiUrl}/${path}`);
        Object.entries(query).forEach(([k, v]) => {
            if (v !== undefined && v !== null) {
                urlObj.searchParams.append(k, v);
            }
        });

        const fetchHeaders = {};
        if (req.headers.authorization) {
            fetchHeaders['Authorization'] = req.headers.authorization;
        }
        if (req.headers['content-type']) {
            fetchHeaders['Content-Type'] = req.headers['content-type'];
        } else {
            fetchHeaders['Content-Type'] = 'application/json';
        }

        const fetchOptions = {
            method: req.method,
            headers: fetchHeaders,
        };

        if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
            fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }

        const backendResponse = await fetch(urlObj.toString(), fetchOptions);
        const data = await backendResponse.text();

        res.status(backendResponse.status);
        try {
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.parse(data));
        } catch (_) {
            res.send(data);
        }
    } catch (err) {
        console.error('[api/maxdata proxy error]', err);
        res.status(500).json({ error: err.message });
    }
};
