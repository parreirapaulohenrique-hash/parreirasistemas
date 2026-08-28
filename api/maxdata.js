/**
 * api/maxdata.js — Vercel Serverless Proxy para API Maxdata
 * ===========================================================
 * CommonJS format (module.exports) + http nativo Node.js
 * Sem dependências externas — funciona em qualquer versão do Node.js no Vercel
 *
 * Uso: GET/POST /api/maxdata?_path=auth&page=1&limit=100
 * →    GET/POST http://rds.skytins.com.br:8720/v2/auth?page=1&limit=100
 */

const http = require('http');
const https = require('https');

const MAXDATA_BASE_HOST = 'rds.skytins.com.br';
const MAXDATA_BASE_PORT = 8720;
const MAXDATA_BASE_PATH = '/v2';

module.exports = async function handler(req, res) {
    // CORS
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Extrai _path e monta query string sem ele
    const { _path, ...queryRest } = req.query || {};
    const endpointPath = (_path || '').replace(/^\/+/, '');

    if (!endpointPath) {
        res.status(400).json({ success: false, message: 'Parâmetro _path ausente.' });
        return;
    }

    const qs = Object.keys(queryRest).length
        ? '?' + new URLSearchParams(queryRest).toString()
        : '';

    const targetPath = `${MAXDATA_BASE_PATH}/${endpointPath}${qs}`;

    // Cabeçalhos para repassar
    const forwardHeaders = { 'Content-Type': 'application/json' };
    if (req.headers['authorization']) {
        forwardHeaders['Authorization'] = req.headers['authorization'];
    }

    // Body para POST/PUT
    let bodyStr = '';
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        forwardHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    // Faz a requisição HTTP para a API Maxdata (server-side, sem CSP)
    return new Promise((resolve) => {
        const options = {
            hostname: MAXDATA_BASE_HOST,
            port:     MAXDATA_BASE_PORT,
            path:     targetPath,
            method:   req.method,
            headers:  forwardHeaders,
            timeout:  15000
        };

        const proxyReq = http.request(options, (proxyRes) => {
            let data = '';
            proxyRes.on('data', (chunk) => { data += chunk; });
            proxyRes.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(data); } catch { parsed = data; }

                res.status(proxyRes.statusCode || 200).json(parsed);
                resolve();
            });
        });

        proxyReq.on('timeout', () => {
            proxyReq.destroy();
            res.status(504).json({ success: false, message: 'Timeout ao conectar na API Maxdata (15s).' });
            resolve();
        });

        proxyReq.on('error', (e) => {
            console.error('[Maxdata Proxy] Erro:', e.message, '→', targetPath);
            res.status(502).json({ success: false, message: `Proxy error: ${e.message}` });
            resolve();
        });

        if (bodyStr) proxyReq.write(bodyStr);
        proxyReq.end();
    });
};
