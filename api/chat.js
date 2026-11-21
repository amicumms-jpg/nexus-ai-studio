import { getDepartmentConfig } from '../agentsConfig.js';

export const maxDuration = 30;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
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
        return res.status(200).json({ status: 'Chat API endpoint is active.' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, message, fileData, model, toolType, department, lang } = req.body || {};

        // Citim toate cheile separate prin virgulă și le amestecăm aleatoriu
        const rawKeys = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
        const apiKeys = rawKeys
            .split(',')
            .map(k => k.trim())
            .filter(Boolean)
            .sort(() => Math.random() - 0.5);

        if (apiKeys.length === 0) {
            return streamTextAsSse(res, '⚠️ Cheia API Gemini lipsește din setările serverului.');
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

        const deptConfig = getDepartmentConfig(department);
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
        const systemPromptText = `${specializedRoleDescription} Răspunde direct, concis și profesional.${langNote}`;
        const systemInstruction = {
            parts: [{ text: systemPromptText }]
        };

        const rawModel = String(model || 'gemini-3.8-flash').trim();
        const lowerModel = rawModel.toLowerCase();

        // Stabilim modelul principal din seria 3.8+
        const primaryGemini = lowerModel.includes('lite')
            ? 'gemini-3.8-flash-lite'
            : (lowerModel.includes('gemini-3.8') ? rawModel : 'gemini-3.8-flash');

        // Cascadă exclusivă pe modele de la 3.8 în sus
        const fallbackChain = [
            primaryGemini,
            'gemini-3.8-flash-lite',
            'gemini-3.8-flash',
            'gemini-3.8-pro'
        ];

        const geminiModelsToTry = [...new Set(fallbackChain)];
        let lastStatus = 503;

        for (const currentGeminiModel of geminiModelsToTry) {
            for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
                const currentKey = apiKeys[keyIdx];
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 16000);

                try {
                    const apiUrl = `https://googleapis.com{encodeURIComponent(currentGeminiModel)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(currentKey)}`;

                    const apiResponse = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            systemInstruction,
                            contents: [{ parts }]
                        }),
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (apiResponse.ok && apiResponse.body) {
                        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
                        res.setHeader('Cache-Control', 'no-cache, no-transform');
                        res.setHeader('Connection', 'keep-alive');
                        res.setHeader('X-Accel-Buffering', 'no');

                        const reader = apiResponse.body.getReader();
                        const decoder = new TextDecoder();

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            res.write(decoder.decode(value, { stream: true }));
                            if (typeof res.flush === 'function') res.flush();
                        }
                        return res.end();
                    }

                    lastStatus = apiResponse.status;
                    const rawErr = await apiResponse.text().catch(() => '');
                    let formattedErr = rawErr;
                    try {
                        const parsedErr = JSON.parse(rawErr);
                        formattedErr = parsedErr?.error?.message || JSON.stringify(parsedErr);
                    } catch (_) {}
                    console.error(`Model ${currentGeminiModel} [Cheia #${keyIdx + 1}] a eșuat (${apiResponse.status}): ${formattedErr}`);

                    // La 429 (cotă atinsă) sau 401/403 (cheie invalidă), trece imediat la următoarea cheie
                    if (apiResponse.status === 429 || apiResponse.status === 401 || apiResponse.status === 403) {
                        continue;
                    }

                    // La 404 (model indisponibil), trece imediat la următorul model din listă
                    if (apiResponse.status === 404) {
                        break;
                    }

                    // La 503 (supraîncărcare), mică pauză înainte de următoarea încercare
                    if (apiResponse.status === 503) {
                        await new Promise(r => setTimeout(r, 1000));
                    }
                } catch (err) {
                    clearTimeout(timeoutId);
                    lastStatus = 503;
                    const reason = err?.name === 'AbortError' ? `Timeout la ${currentGeminiModel}` : (err?.message || 'Eroare Gemini');
                    console.error(`Excepție la ${currentGeminiModel} [Cheia #${keyIdx + 1}]:`, reason);
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }

        if (lastStatus === 429) {
            return streamTextAsSse(
                res,
                '⚠️ Limita zilnică gratuită a fost atinsă pe toate cheile și modelele disponibile. Te rog reîncearcă mai târziu.'
            );
        }

        return streamTextAsSse(
            res,
            '⚠️ Serverele Google Gemini sunt temporar supraîncărcate. Reîncearcă mesajul în câteva secunde.'
        );
    } catch (error) {
        console.error("Eroare server API chat:", error);
        if (!res.headersSent) {
            return streamTextAsSse(res, '⚠️ Eroare internă temporară. Te rog retrimite mesajul.');
        }
        res.end();
    }
}

function streamTextAsSse(res, fullText) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const chunkSize = 180;
    for (let i = 0; i < fullText.length; i += chunkSize) {
        const piece = fullText.slice(i, i + chunkSize);
        const payload = {
            candidates: [{ content: { parts: [{ text: piece }] } }]
        };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        if (typeof res.flush === 'function') res.flush();
    }
    return res.end();
}
