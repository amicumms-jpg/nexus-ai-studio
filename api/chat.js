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
        return res.status(200).json({ status: 'Chat API endpoint is active.' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, message, fileData, model, toolType, department, lang } = req.body || {};
        const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
        const openaiApiKey = process.env.OPENAI_API_KEY;
        const falKey = process.env.FAL_KEY;

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

        const rawModel = String(model || 'gemini-3.8-flash').trim();
        const lowerModel = rawModel.toLowerCase();

        // Doar modele Gemini de la 3.8 în sus (fără 1.5 / 2.0 / 2.5)
        const selectedGemini = lowerModel.includes('gemini') && !/1\.5|2\.0|2\.5/.test(lowerModel)
            ? rawModel
            : 'gemini-3.8-flash';

        const geminiCandidates = [...new Set([
            selectedGemini,
            'gemini-3.8-flash',
            'gemini-3.8-pro'
        ])];

        let hitQuotaOrDemand = false;
        let lastError = 'Serviciul AI este temporar indisponibil.';

        if (geminiApiKey) {
            for (const gModel of geminiCandidates) {
                try {
                    const apiResponse = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(gModel)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(geminiApiKey)}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                systemInstruction,
                                contents: [{ parts }]
                            }),
                            signal: AbortSignal.timeout(5500)
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
                    lastError = errText || `Eroare ${gModel} (${apiResponse.status})`;
                    if (apiResponse.status === 429 || apiResponse.status === 503 || /429|503|quota|high demand|resource_exhausted/i.test(errText)) {
                        hitQuotaOrDemand = true;
                    }
                } catch (err) {
                    hitQuotaOrDemand = true;
                    lastError = err?.name === 'TimeoutError' ? `Timeout la ${gModel}` : (err?.message || 'Eroare Gemini');
                }
            }
        }

        if ((lowerModel.includes('deepseek') || lowerModel.includes('backup 1')) && deepseekApiKey) {
            try {
                const dsText = await callOpenAiCompatible(
                    'https://api.deepseek.com/chat/completions',
                    deepseekApiKey,
                    'deepseek-chat',
                    systemPromptText,
                    userPrompt
                );
                if (dsText) return streamTextAsSse(res, dsText);
            } catch (err) {
                lastError = err?.message || 'Eroare DeepSeek';
            }
        }

        if ((lowerModel.includes('gpt') || lowerModel.includes('openai') || lowerModel.includes('backup 2')) && openaiApiKey) {
            try {
                const oaiText = await callOpenAiCompatible(
                    'https://api.openai.com/v1/chat/completions',
                    openaiApiKey,
                    'gpt-4o-mini',
                    systemPromptText,
                    userPrompt
                );
                if (oaiText) return streamTextAsSse(res, oaiText);
            } catch (err) {
                lastError = err?.message || 'Eroare OpenAI';
            }
        }

        if (falKey) {
            try {
                const falRes = await fetch('https://fal.run/fal-ai/any-llm', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Key ${falKey}`
                    },
                    body: JSON.stringify({
                        model: 'google/gemini-3.8-flash',
                        system_prompt: systemPromptText,
                        prompt: userPrompt
                    }),
                    signal: AbortSignal.timeout(6000)
                });
                const falData = await falRes.json().catch(() => ({}));
                const falText = falData?.output || falData?.text || falData?.response || '';
                if (falRes.ok && falText) {
                    return streamTextAsSse(res, String(falText));
                }
            } catch (_) {
                // ignorăm dacă nu are credit/acces
            }
        }

        if (hitQuotaOrDemand) {
            return res.status(200).json({ error: 'QUOTA_EXCEEDED' });
        }

        return res.status(200).json({ error: lastError });
    } catch (error) {
        console.error("Eroare server API chat:", error);
        if (!res.headersSent) {
            return res.status(200).json({ error: 'QUOTA_EXCEEDED' });
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
        }),
        signal: AbortSignal.timeout(4500)
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
