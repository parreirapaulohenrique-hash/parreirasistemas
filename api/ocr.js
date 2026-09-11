/**
 * api/ocr.js - Proxy OCR server-side (sem CORS)
 */

const OCR_API_KEY  = "helloworld";
const OCR_ENDPOINT = "https://api.ocr.space/parse/image";

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
        return res.status(400).json({ error: "Erro ao ler body" });
    }

    let parsed;
    try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch (e) { return res.status(400).json({ error: "JSON invalido" }); }

    const base64Image = parsed.base64;
    if (!base64Image || !base64Image.startsWith("data:image")) {
        return res.status(400).json({ error: "Imagem base64 invalida" });
    }

    // URLSearchParams para enviar ao OCR.space
    const form = new URLSearchParams();
    form.append("base64Image", base64Image);
    form.append("apikey",      OCR_API_KEY);
    form.append("language",    "por");
    form.append("OCREngine",   "2");
    form.append("isTable",     "true");      // Engine 1 - gratuito e compativel
    form.append("detectOrientation", "true");
    form.append("scale",       "true");   // melhora leitura de imagens pequenas

    let ocrResp;
    try {
        ocrResp = await fetch(OCR_ENDPOINT, {
            method:  "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body:    form.toString()
        });
    } catch (e) {
        return res.status(502).json({ error: "Falha ao contactar OCR.space: " + e.message });
    }

    let ocrData;
    try { ocrData = await ocrResp.json(); }
    catch (e) { return res.status(502).json({ error: "Resposta OCR invalida" }); }

    console.log("[OCR] status:", ocrData.OCRExitCode, "errored:", ocrData.IsErroredOnProcessing);

    if (ocrData.IsErroredOnProcessing) {
        const msg = Array.isArray(ocrData.ErrorMessage) ? ocrData.ErrorMessage.join("; ") : (ocrData.ErrorMessage || "Erro OCR");
        return res.status(422).json({ error: msg });
    }

    const text = (ocrData.ParsedResults && ocrData.ParsedResults[0])
        ? (ocrData.ParsedResults[0].ParsedText || "").trim()
        : "";

    return res.status(200).json({ text, exitCode: ocrData.OCRExitCode });
};