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

        const rawKeys = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
        const apiKeys = rawKeys
            .split(',')
            .map(k => k.trim())
            .filter(Boolean);

        if (apiKeys.length === 0) {
            return res.status(500).json({
                error: 'Cheia API Gemini lipsește din setările serverului.'
            });
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

        const targetGeminiModel = lowerModel.includes('gemini-3.8') && !/1\.5|2\.0|2\.5|lite/.test(lowerModel)
            ? rawModel
            : 'gemini-3.8-flash';

        let lastStatus = 503;
        const startTime = Date.now();
        const maxTotalBudgetMs = 25000;
        const maxRounds = 2;

        for (let round = 1; round <= maxRounds; round++) {
            if (Date.now() - startTime > maxTotalBudgetMs) break;

            for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
                if (Date.now() - startTime > maxTotalBudgetMs) break;

                const currentKey = apiKeys[keyIdx];
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 9500);

                try {
                    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetGeminiModel)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(currentKey)}`;

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
                    console.error(`Model ${targetGeminiModel} [Runda ${round}/${maxRounds}, Cheia #${keyIdx + 1}] a eșuat (${apiResponse.status}): ${formattedErr}`);

                    if (apiResponse.status === 404 || apiResponse.status === 401 || apiResponse.status === 403) {
                        continue;
                    }

                    if (apiResponse.status === 503 || apiResponse.status === 429) {
                        const waitMs = round === 1 ? 1500 : 2500;
                        await new Promise(r => setTimeout(r, waitMs));
                    }
                } catch (err) {
                    clearTimeout(timeoutId);
                    lastStatus = 503;
                    const reason = err?.name === 'AbortError' ? `Timeout la ${targetGeminiModel}` : (err?.message || 'Eroare Gemini');
                    console.error(`Excepție la ${targetGeminiModel} [Runda ${round}/${maxRounds}, Cheia #${keyIdx + 1}]:`, reason);
                    const waitMs = round === 1 ? 1500 : 2500;
                    await new Promise(r => setTimeout(r, waitMs));
                }
            }
        }

        if (lastStatus === 429) {
            return res.status(429).json({
                error: 'QUOTA_EXCEEDED',
                message: 'Limita zilnică gratuită a fost atinsă pe toate cheile disponibile.'
            });
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
