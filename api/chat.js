export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, fileData, model } = req.body;
        
        // Mapăm ce vine din interfață pe modelele oficiale suportate de Google API
        let targetModel = 'gemini-1.5-flash';
        if (model && model.includes('pro')) {
            targetModel = 'gemini-1.5-pro';
        } else if (model && model.includes('experimental')) {
            targetModel = 'gemini-1.5-flash';
        }

        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'Cheia GEMINI_API_KEY nu este setată în Vercel!' });
        }

        let parts = [{ text: prompt || "Analizează acest fișier:" }];

        if (fileData && fileData.base64 && fileData.mimeType) {
            parts.push({
                inlineData: {
                    mimeType: fileData.mimeType,
                    data: fileData.base64
                }
            });
        }

        let apiResponse;
        let data;
        let attempts = 0;
        const maxAttempts = 3;

        // Încercăm modelul principal și avem fallback pe celălalt model oficial
        const modelsToTry = [targetModel, 'gemini-1.5-flash', 'gemini-1.5-pro'];
        let currentModelIndex = 0;

        while (attempts < maxAttempts) {
            attempts++;
            const activeModel = modelsToTry[currentModelIndex] || 'gemini-1.5-flash';

            apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: parts }] })
            });

            const rawText = await apiResponse.text();

            try {
                data = JSON.parse(rawText);
            } catch (e) {
                throw new Error("Răspuns invalid de la serverul Google: " + rawText.substring(0, 100));
            }

            // Dacă cererea a reușit, oprim bucla
            if (apiResponse.ok) {
                break;
            }

            // Dacă modelul dă eroare de trafic sau nu e găsit, trecem la următorul
            if (data.error?.message?.includes('high demand') || data.error?.message?.includes('not found') || data.error?.status === 'RESOURCE_EXHAUSTED') {
                if (currentModelIndex < modelsToTry.length - 1) {
                    currentModelIndex++;
                    continue;
                }
            }

            // Dacă mai avem încercări pe același model, așteptăm 1.5 secunde
            if (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }

        if (!apiResponse.ok) {
            throw new Error(data.error?.message || 'Eroare de la serverul Google Gemini');
        }

        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Răspuns gol primit de la AI.";

        return res.status(200).json({ text: responseText });

    } catch (error) {
        console.error("Eroare server API chat:", error);
        return res.status(500).json({ error: error.message || 'Eroare internă de server.' });
    }
}
