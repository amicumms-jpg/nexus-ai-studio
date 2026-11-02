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
        return res.status(200).json({ status: 'Chat API endpoint is active (Fallback & Streaming enabled).' });
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

        const activeModel = model || 'gemini-3.8-flash';

        // Setăm antetele pentru streaming instant
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        // Ordinea de fallback automată în caz de 503 sau 429
        const modelsToTry = [
            activeModel,
            'gemini-3.8-flash',
            'gemini-3.6-flash',
            'gemini-3.5-flash-lite'
        ];
        
        // Eliminăm duplicatele din listă
        const uniqueModelsToTry = [...new Set(modelsToTry)];

        let apiResponse;
        let success = false;

        for (const modelToTest of uniqueModelsToTry) {
            try {
                apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelToTest}:streamGenerateContent?alt=sse&key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        systemInstruction: systemInstruction,
                        contents: [{ parts: parts }]
                    })
                });

                if (apiResponse.ok) {
                    success = true;
                    break;
                } else {
                    const errText = await apiResponse.clone().text();
                    // Dacă primim eroare 503 (Unavailable) sau 429 (Rate Limit), trecem la următorul model
                    if (apiResponse.status === 503 || apiResponse.status === 429 || errText.includes('503') || errText.includes('UNAVAILABLE')) {
                        console.warn(`Modelul ${modelToTest} este ocupat (Eroare ${apiResponse.status}), încercăm următorul model alternativ...`);
                        continue;
                    } else {
                        // Pentru alte tipuri de erori, oprim bucla
                        break;
                    }
                }
            } catch (err) {
                console.warn(`Eroare de rețea pentru modelul ${modelToTest}:`, err);
            }
        }

        if (!success || !apiResponse.ok) {
            const errBody = apiResponse ? await apiResponse.text() : 'Eroare de rețea';
            throw new Error(`Toate modelele sunt momentan suprasolicitate (Eroare 503/429). Detalii: ${errBody}`);
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
