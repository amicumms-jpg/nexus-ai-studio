export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, fileData } = req.body;
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

        // 1. Mai întâi obținem lista de modele valide pentru această cheie specifică
        const listResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const listData = await listResponse.json();

        let activeModel = 'gemini-1.5-flash'; // fallback sigur
        if (listData.models) {
            // Căutăm un model compatibil de generare conținut din lista returnată de cheia ta
            const validModel = listData.models.find(m => m.supportedGenerationMethods?.includes('generateContent') && m.name.includes('flash'));
            if (validModel) {
                activeModel = validModel.name.replace('models/', '');
            } else if (listData.models.length > 0) {
                activeModel = listData.models[0].name.replace('models/', '');
            }
        }

        // 2. Trimitem cererea folosind modelul descoperit automat de la cheia ta
        let apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: parts }] })
        });

        const rawText = await apiResponse.text();
        let data;

        try {
            data = JSON.parse(rawText);
        } catch (e) {
            throw new Error("Răspuns invalid de la serverul Google: " + rawText.substring(0, 100));
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
