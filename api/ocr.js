/**
 * api/ocr.js - Proxy OCR server-side (sem CORS) com Rotação Ativa de Chaves & Multi-Engine Fallback
 * ==============================================================================================
 * Motor multi-camada:
 * 1. Prioriza OCR Engine 1 com isTable=true (essencial para capturar colunas com \t preservadas).
 * 2. Pool rotativo de chaves: se uma chave sofrer rate limit (HTTP 429) ou erro, rotaciona imediatamente
 *    para a próxima chave mantendo Engine 1 e isTable=true.
 * 3. Fallbacks automáticos (Engine 1 sem orientação, Engine 2 Deep Learning) caso a imagem esteja rotacionada.
 */

const OCR_KEYS = [
    "K88452445888957",
    "K81498688888957",
    process.env.OCR_API_KEY,
    "K87899142388957",
    "helloworld"
].filter(Boolean);

const OCR_ENDPOINT = "https://api.ocr.space/parse/image";

async function doOcrRequest(base64Image, engine = "1", isTable = true, detectOrientation = true, apiKey = OCR_KEYS[0]) {
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

async function tryOcrAcrossKeys(base64Image, engine = "1", isTable = true, detectOrientation = true) {
    let lastError = null;
    for (const key of OCR_KEYS) {
        try {
            const data = await doOcrRequest(base64Image, engine, isTable, detectOrientation, key);
            if (!data.IsErroredOnProcessing && data.ParsedResults && data.ParsedResults[0]) {
                const text = (data.ParsedResults[0].ParsedText || "").trim();
                if (text.length >= 20) {
                    return { text: text, keyUsed: key, error: null };
                }
            } else if (data.ErrorMessage) {
                lastError = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join("; ") : data.ErrorMessage;
            }
        } catch (err) {
            lastError = err.message;
            console.warn(`[OCR] Chave ${key.slice(0, 5)}... falhou (${err.message}). Tentando próxima chave...`);
        }
    }
    return { text: "", error: lastError };
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

    // Tentativa 1: Engine 1 com isTable (ideal para tabelas e romaneios) testando chaves válidas
    const res1 = await tryOcrAcrossKeys(base64Image, parsed.engine || "1", true, true);
    if (res1.text && res1.text.length >= 20) {
        text = res1.text;
    } else {
        lastError = res1.error;
    }

    // Tentativa 2: Engine 1 com isTable sem detecção de orientação (caso bordas escuras atrapalhem)
    if (text.length < 20) {
        console.log("[OCR] Tentativa 2: Engine 1 sem detecção de orientação...");
        const res2 = await tryOcrAcrossKeys(base64Image, "1", true, false);
        if (res2.text && res2.text.length > text.length) {
            text = res2.text;
        }
    }

    // Tentativa 3 (Fallback): Engine 2 (Deep Learning Neural) caso Engine 1 não reconheça nada
    if (text.length < 20) {
        console.log("[OCR] Tentativa 3: Engine 2 Deep Learning...");
        const res3 = await tryOcrAcrossKeys(base64Image, "2", false, true);
        if (res3.text && res3.text.length > text.length) {
            text = res3.text;
        }
    }

    if (text.length === 0 && lastError) {
        return res.status(422).json({ error: lastError });
    }

    return res.status(200).json({ text: text, exitCode: 1 });
};