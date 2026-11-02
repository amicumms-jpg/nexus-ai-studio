import { DEPARTMENTS } from '../agentsConfig.js';

// Mărește timpul maxim de execuție pe Vercel la 30 de secunde
export const maxDuration = 30;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        return res.status(200).json({ status: 'Chat API endpoint is active (Gemini 3.8 Streaming enabled).' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, message, fileData, model, toolType } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'Cheia GEMINI_API_KEY nu este setată în Vercel!' });
        }

        const userPrompt = prompt || message || "Analizează acest fișier:";

        let parts = [{ text: userPrompt }];

        if (fileData && fileData.base64 && fileData.mimeType) {
            parts.push({
                inlineData: {
                    mimeType: fileData.mimeType,
                    data: fileData.base64
                }
            });
        }

        let specializedRoleDescription = "Ești Asistentul Virtual Oficial Nexus AI Studio Pro (nexusaistudio.ro).";

        switch (toolType) {
            case 'chat':
                specializedRoleDescription = "Ești un expert avansat în cercetare, logică și programare.";
                break;
            case 'imageGen':
                specializedRoleDescription = "Ești un specialist în ingineria prompturilor vizuale.";
                break;
            case 'pdfTools':
                specializedRoleDescription = "Ești un expert în analiza și sinteza documentelor PDF.";
                break;
            case 'writing':
                specializedRoleDescription = "Ești un copywriter profesionist.";
                break;
            default:
                break;
        }

        const systemInstruction = {
            parts: [{
                text: `${specializedRoleDescription} Răspunde direct, concis și profesional.`
            }]
        };

        // Forțăm modelul oficial Gemini 3.8 Flash compatibil cu noile chei
        const activeModel = model && model.includes('flash') ? model : 'gemini-3.8-flash';

        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        let apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:streamGenerateContent?alt=sse&key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: systemInstruction,
                contents: [{ parts: parts }]
            })
        });

        if (!apiResponse.ok) {
            const errBody = await apiResponse.text();
            throw new Error(`Eroare Google Gemini API (${apiResponse.status}): ${errBody}`);
        }

        const reader = apiResponse.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            res.write(chunk);

            if (typeof res.flush === 'function') {
                res.flush();
            }
        }

        res.end();

    } catch (error) {
        console.error("Eroare server API chat:", error);
        if (!res.headersSent) {
            if (error.message.toLowerCase().includes('quota') || error.message.includes('429')) {
                return res.status(200).json({ error: 'QUOTA_EXCEEDED' });
            }
            return res.status(500).json({ error: error.message || 'Eroare internă de server.' });
        } else {
            res.end();
        }
    }
}
