import { DEPARTMENTS } from '../agentsConfig.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method === 'GET') return res.status(200).json({ status: 'Chat API endpoint active.' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { prompt, message, fileData, model, department } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'Cheia GEMINI_API_KEY nu este setată în Vercel!' });
        }

        const selectedDept = Object.values(DEPARTMENTS).find(d => d.id === department) || DEPARTMENTS.GENERAL;
        const userPrompt = prompt || message || "Analizează acest fișier:";
        
        const finalPrompt = `[Instrucțiune rol specialist: ${selectedDept.systemPrompt}]\n\nÎntrebare / Cerere utilizator: ${userPrompt}`;

        let parts = [{ text: finalPrompt }];

        if (fileData && fileData.base64 && fileData.mimeType) {
            parts.push({
                inlineData: {
                    mimeType: fileData.mimeType,
                    data: fileData.base64
                }
            });
        }

        const modelsToTry = [
            model || 'gemini-3.8-flash',
            'gemini-2.5-flash',
            'gemini-1.5-flash'
        ];

        let apiResponse = null;
        let data = null;
        let success = false;

        // Parcurgem modelele cu limită de timp (timeout) de 8 secunde per încercare
        for (let currentModel of modelsToTry) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 secunde timeout

            try {
                apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts }] }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                const rawText = await apiResponse.text();
                try {
                    data = JSON.parse(rawText);
                } catch (e) {
                    data = null;
                }

                if (apiResponse.ok && data?.candidates?.[0]) {
                    success = true;
                    break;
                }
            } catch (err) {
                clearTimeout(timeoutId);
                console.warn(`Modelul ${currentModel} a eșuat sau a expirat timeout-ul:`, err.message);
            }
        }

        if (!success || !apiResponse?.ok) {
            throw new Error(data?.error?.message || 'Toate modelele Gemini sunt momentan ocupate. Te rugăm să încerci din nou.');
        }

        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Răspuns gol primit de la AI.";

        return res.status(200).json({ text: responseText, reply: responseText });

    } catch (error) {
        console.error("Eroare server API chat:", error);
        return res.status(500).json({ error: error.message || 'Eroare internă de server.' });
    }
}
