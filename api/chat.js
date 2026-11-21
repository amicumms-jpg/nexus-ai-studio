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
        const { prompt, message, fileData, model, toolType, department, lang } = req.body || {};
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'Cheia GEMINI_API_KEY nu este setată în Vercel!' });
        }

        const userPrompt = prompt || message || "Analizează acest fișier:";

        const parts = [{ text: userPrompt }];

        if (fileData && fileData.base64 && fileData.mimeType) {
            parts.push({
                inlineData: {
                    mimeType: fileData.mimeType,
                    data: fileData.base64
                }
            });
        }

        let specializedRoleDescription = "Ești Asistentul Virtual Oficial Nexus AI Studio Pro (nexusaistudio.ro).";

        const deptConfig = department && DEPARTMENTS ? DEPARTMENTS[department] : null;
        if (deptConfig && (deptConfig.systemPrompt || deptConfig.prompt || deptConfig.description)) {
            specializedRoleDescription = deptConfig.systemPrompt || deptConfig.prompt || deptConfig.description;
        }

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

        const langNote = lang ? ` Răspunde în limba "${lang}".` : '';
        const systemInstruction = {
            parts: [{
                text: `${specializedRoleDescription} Răspunde direct, concis și profesional.${langNote}`
            }]
        };

        const activeModel = model || 'gemini-3.8-flash';

        // Ordinea de fallback automată în caz de 503, 429 sau operație nesuportată
        const modelsToTry = [
            activeModel,
            'gemini-3.8-flash',
            'gemini-2.5-flash',
            'gemini-2.0-flash',
            'gemini-flash-latest'
        ];

        // Eliminăm duplicatele din listă
        const uniqueModelsToTry = [...new Set(modelsToTry)];

        let apiResponse = null;
        let success = false;
        let lastErrText = '';
        let hitRateLimit = false;

        for (const modelToTest of uniqueModelsToTry) {
            try {
                const candidateRes = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelToTest)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            systemInstruction: systemInstruction,
                            contents: [{ parts: parts }]
                        })
                    }
                );

                if (candidateRes.ok && candidateRes.body) {
                    apiResponse = candidateRes;
                    success = true;
                    break;
                }

                const errText = await candidateRes.text().catch(() => '');
                lastErrText = errText || `HTTP ${candidateRes.status}`;

                if (candidateRes.status === 429 || /429|quota|resource_exhausted/i.test(errText)) {
                    hitRateLimit = true;
                    console.warn(`Modelul ${modelToTest} a atins limita (429), trecem imediat la următorul model...`);
                    continue;
                }

                if (
                    candidateRes.status === 503 ||
                    candidateRes.status === 404 ||
                    /503|unavailable|not supported|unsupported|not found/i.test(errText)
                ) {
                    console.warn(`Modelul ${modelToTest} indisponibil/nesuportat (${candidateRes.status}), trecem la următorul model...`);
                    continue;
                }

                break;
            } catch (err) {
                lastErrText = err?.message || 'Eroare de rețea';
                console.warn(`Eroare de rețea pentru modelul ${modelToTest}:`, err);
            }
        }

        if (!success || !apiResponse || !apiResponse.body) {
            throw new Error(
                lastErrText || (hitRateLimit ? '429 QUOTA_EXCEEDED' : 'Toate modelele sunt momentan indisponibile.')
            );
        }

        // Setăm antetele pentru streaming instant doar după ce avem stream valid
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

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
            const errMessage = error?.message || 'Eroare internă de server.';
            if (errMessage.toLowerCase().includes('quota') || errMessage.includes('429')) {
                return res.status(200).json({ error: 'QUOTA_EXCEEDED' });
            }
            return res.status(500).json({ error: errMessage });
        } else {
            res.end();
        }
    }
}
