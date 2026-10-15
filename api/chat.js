export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, fileData, model } = req.body;
        const selectedModel = model || 'gemini-1.5-pro';
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

        // Mecanism de retry în caz de suprasolicitare temporară (high demand)
        while (attempts < maxAttempts) {
            attempts++;
            apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`, {
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

            // Dacă cererea a reușit sau e altă eroare decât de trafic, ieșim din buclă
            if (apiResponse.ok || !data.error?.message?.includes('high demand')) {
                break;
            }

            // Dacă e eroare de high demand și mai avem încercări, așteptăm 1.5 secunde și reîncercăm
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
