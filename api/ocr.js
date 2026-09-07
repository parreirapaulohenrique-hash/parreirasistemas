/**
 * api/ocr.js - Proxy OCR server-side (sem CORS)
 * ================================================
 * Recebe: POST { base64: "data:image/jpeg;base64,..." }
 * Retorna: { text: "...", error: null }
 * Chama OCR.space server-to-server - resolve bloqueio CORS do browser.
 */

const OCR_API_KEY  = "helloworld";
const OCR_ENDPOINT = "https://api.ocr.space/parse/image";

module.exports = async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

    let body = "";
    try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        body = Buffer.concat(chunks).toString("utf8");
    } catch (e) {
        return res.status(400).json({ error: "Erro ao ler body: " + e.message });
    }

    let parsed;
    try { parsed = JSON.parse(body); }
    catch (e) { return res.status(400).json({ error: "JSON invalido" }); }

    const base64Image = parsed.base64;
    if (!base64Image || !base64Image.startsWith("data:image")) {
        return res.status(400).json({ error: "Campo base64 invalido ou ausente" });
    }

    const formData = new URLSearchParams();
    formData.append("base64Image", base64Image);
    formData.append("apikey",      OCR_API_KEY);
    formData.append("language",    "por");
    formData.append("isTable",     "true");
    formData.append("OCREngine",   "2");

    let ocrResponse;
    try {
        ocrResponse = await fetch(OCR_ENDPOINT, {
            method:  "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body:    formData.toString()
        });
    } catch (e) {
        return res.status(502).json({ error: "Falha ao conectar OCR.space: " + e.message });
    }

    let ocrData;
    try { ocrData = await ocrResponse.json(); }
    catch (e) { return res.status(502).json({ error: "Resposta OCR invalida" }); }

    if (ocrData.IsErroredOnProcessing) {
        return res.status(422).json({ error: ocrData.ErrorMessage || "OCR.space erro" });
    }

    const text = (ocrData.ParsedResults && ocrData.ParsedResults[0])
        ? (ocrData.ParsedResults[0].ParsedText || "").trim()
        : "";

    return res.status(200).json({ text });
};