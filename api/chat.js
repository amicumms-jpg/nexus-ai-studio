import { DEPARTMENTS } from '../agentsConfig.js';

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
        return res.status(200).json({ status: 'Chat API endpoint is active (Gemini + Backup 1 & 2).' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, message, fileData, model, toolType, department, lang } = req.body || {};
        const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
        const openaiApiKey = process.env.OPENAI_API_KEY;

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
        const systemPromptText = `${specializedRoleDescription} Răspunde direct, concis și profesional.${langNote}`;
        const systemInstruction = {
            parts: [{ text: systemPromptText }]
        };

        const requestedModel = (model || 'gemini-3.8-flash').trim();

        // Ordinea de încercare: modelul ales din dropdown -> Gemini 3.8 Flash -> Backup 1 (DeepSeek) -> Backup 2 (OpenAI)
        const pipeline = [...new Set([
            requestedModel,
            'gemini-3.8-flash',
            'deepseek-chat',
            'gpt-4o-mini'
        ])];

        let hitQuota = false;
        let lastError = 'Niciun model nu a putut răspunde.';

        for (const currentModel of pipeline) {
            const lower = currentModel.toLowerCase();

            // 1. Modele Gemini
            if (lower.includes('gemini')) {
                if (!geminiApiKey) {
                    lastError = 'Cheia GEMINI_API_KEY nu este setată în Vercel.';
                    continue;
                }

                try {
                    const apiResponse = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(currentModel)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(geminiApiKey)}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                systemInstruction,
                                contents: [{ parts }]
                            })
                        }
                    );

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

                    const errText = await apiResponse.text().catch(() => '');
                    lastError = errText || `Eroare ${currentModel} (${apiResponse.status})`;
                    if (apiResponse.status === 429 || /429|quota|resource_exhausted/i.test(errText)) {
                        hitQuota = true;
                        console.warn(`Modelul ${currentModel} a atins limita (429), trecem pe backup...`);
                    } else {
                        console.warn(`Modelul ${currentModel} a eșuat (${apiResponse.status}), trecem pe backup...`);
                    }
                } catch (err) {
                    lastError = err?.message || 'Eroare de rețea Gemini.';
                }
                continue;
            }

            // 2. Backup 1: DeepSeek Chat
            if (lower.includes('deepseek')) {
                if (!deepseekApiKey) continue;
                try {
                    const dsText = await callOpenAiCompatible(
                        'https://api.deepseek.com/chat/completions',
                        deepseekApiKey,
                        currentModel,
                        systemPromptText,
                        userPrompt
                    );
                    if (dsText) {
                        return streamTextAsSse(res, dsText);
                    }
                } catch (err) {
                    lastError = err?.message || 'Eroare DeepSeek.';
                }
                continue;
            }

            // 3. Backup 2: OpenAI GPT-4o-mini
            if (lower.includes('gpt') || lower.includes('openai')) {
                if (!openaiApiKey) continue;
                try {
                    const oaiText = await callOpenAiCompatible(
                        'https://api.openai.com/v1/chat/completions',
                        openaiApiKey,
                        currentModel,
                        systemPromptText,
                        userPrompt
                    );
                    if (oaiText) {
                        return streamTextAsSse(res, oaiText);
                    }
                } catch (err) {
                    lastError = err?.message || 'Eroare OpenAI.';
                }
                continue;
            }
        }

        if (hitQuota && !deepseekApiKey && !openaiApiKey) {
            return res.status(200).json({ error: 'QUOTA_EXCEEDED' });
        }

        return res.status(502).json({ error: lastError });
    } catch (error) {
        console.error("Eroare server API chat:", error);
        if (!res.headersSent) {
            const errMessage = error?.message || 'Eroare internă de server.';
            if (errMessage.toLowerCase().includes('quota') || errMessage.includes('429')) {
                return res.status(200).json({ error: 'QUOTA_EXCEEDED' });
            }
            return res.status(500).json({ error: errMessage });
        }
        res.end();
    }
}

async function callOpenAiCompatible(endpoint, apiKey, model, systemPrompt, userText) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userText }
            ],
            stream: false
        })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.error?.message || `Eroare ${model} (${response.status})`);
    }
    return data?.choices?.[0]?.message?.content?.trim() || '';
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
