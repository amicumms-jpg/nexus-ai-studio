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

        // Folosim strict modelul compatibil cu noile chei
        const activeModel = model || 'gemini-3.8-flash';

        let apiResponse = null;
        let data = null;
        let success = false;
        let maxRetries = 2;

        // Încercăm modelul cu reîncercare automată și timeout de 8 secunde
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            try {
                apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`, {
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
                console.warn(`Încercarea ${attempt} a eșuat:`, err.message);
            }
        }

        if (!success || !apiResponse?.ok) {
            throw new Error(data?.error?.message || 'Modelul este momentan suprasolicitat. Te rugăm să încerci din nou.');
        }

        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Răspuns gol primit de la AI.";

        return res.status(200).json({ text: responseText, reply: responseText });

    } catch (error) {
        console.error("Eroare server API chat:", error);
        return res.status(500).json({ error: error.message || 'Eroare internă de server.' });
    }
}
