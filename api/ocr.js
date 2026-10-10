/**
 * api/ocr.js - Proxy OCR server-side (sem CORS) com Multi-Engine Fallback
 * ======================================================================
 * Motor multi-camada:
 * 1. Tenta OCR Engine 1 (com isTable=true) para colunas tabuladas.
 * 2. Se falhar ou retornar pouco texto (< 15 chars), faz fallback automático para Engine 2 (Deep Learning).
 * 3. Suporta chaves públicas e variáveis de ambiente com tratamento resiliente de rate limit.
 */

const OCR_API_KEY  = process.env.OCR_API_KEY || "K87899142388957"; // Chave primária com fallback
const FALLBACK_KEYS = ["helloworld", "K88452445888957", "K81498688888957"];
const OCR_ENDPOINT = "https://api.ocr.space/parse/image";

async function doOcrRequest(base64Image, engine = "1", isTable = true, detectOrientation = true, apiKey = OCR_API_KEY) {
    const form = new URLSearchParams();
    form.append("base64Image", base64Image);
    form.append("apikey",      apiKey);
    form.append("language",    "por");
    form.append("OCREngine",   String(engine));
    form.append("isTable",     isTable ? "true" : "false");
    form.append("detectOrientation", detectOrientation ? "true" : "false");
    form.append("scale",       "true");

    const resp = await fetch(OCR_ENDPOINT, {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    form.toString()
    });

    if (!resp.ok) {
        throw new Error(`OCR endpoint HTTP ${resp.status}`);
    }

    return await resp.json();
}

module.exports = async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

    const chunks = [];
    try {
        for await (const chunk of req) chunks.push(chunk);
    } catch (e) {
        return res.status(400).json({ error: "Erro ao ler corpo da requisição." });
    }

    let parsed;
    try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch (e) { return res.status(400).json({ error: "JSON inválido." }); }

    const base64Image = parsed.base64;
    if (!base64Image || !base64Image.startsWith("data:image")) {
        return res.status(400).json({ error: "Imagem base64 inválida ou formato incompatível." });
    }

    let text = "";
    let lastError = null;

    // Tentativa 1: Engine 1 com isTable (ideal para documentos tabulados)
    try {
        const data1 = await doOcrRequest(base64Image, parsed.engine || "1", true, true, OCR_API_KEY);
        if (!data1.IsErroredOnProcessing && data1.ParsedResults && data1.ParsedResults[0]) {
            text = (data1.ParsedResults[0].ParsedText || "").trim();
        } else if (data1.ErrorMessage) {
            lastError = Array.isArray(data1.ErrorMessage) ? data1.ErrorMessage.join("; ") : data1.ErrorMessage;
        }
    } catch (e) {
        lastError = e.message;
    }

    // Tentativa 2 (Fallback): Se Engine 1 retornar pouco texto (< 20 caracteres), tenta Engine 2 (Deep Learning Neural)
    if (text.length < 20) {
        try {
            console.log("[OCR] Engine 1 retornou pouco texto (" + text.length + " chars). Tentando Engine 2...");
            const data2 = await doOcrRequest(base64Image, "2", false, true, FALLBACK_KEYS[0] || "helloworld");
            if (!data2.IsErroredOnProcessing && data2.ParsedResults && data2.ParsedResults[0]) {
                const text2 = (data2.ParsedResults[0].ParsedText || "").trim();
                if (text2.length > text.length) {
                    text = text2;
                }
            }
        } catch (e2) {
            console.warn("[OCR] Fallback Engine 2 falhou:", e2.message);
        }
    }

    // Tentativa 3 (Fallback sem detecção de orientação): útil quando bordas escuras confundem o orientador
    if (text.length < 20) {
        try {
            const data3 = await doOcrRequest(base64Image, "1", false, false, "helloworld");
            if (!data3.IsErroredOnProcessing && data3.ParsedResults && data3.ParsedResults[0]) {
                const text3 = (data3.ParsedResults[0].ParsedText || "").trim();
                if (text3.length > text.length) {
                    text = text3;
                }
            }
        } catch (_) {}
    }

    if (text.length === 0 && lastError) {
        return res.status(422).json({ error: lastError });
    }

    return res.status(200).json({ text: text, exitCode: 1 });
};