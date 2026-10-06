export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt lipsa' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Eroare: GEMINI_API_KEY nu este configurata in Vercel!' });
        }

        // Apel nativ simplu, stabil și complet compatibil cu noile chei Google (prefix "AQ.")
        const response = await fetch(`https://googleapis.com{apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();

        if (data.error) {
            return res.status(data.error.code || 400).json({ error: data.error.message });
        }

        // Extragerea corectă și sigură a proprietăților JSON conform specificațiilor oficiale Google
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
            const aiResponseText = data.candidates[0].content.parts[0].text;
            return res.status(200).json({ text: aiResponseText });
        } else {
            return res.status(500).json({ error: 'Structura raspunsului de la Google este neasteptata.', raw: data });
        }

    } catch (error) {
        console.error("Gemini API Error:", error);
        return res.status(500).json({ error: error.message || 'Eroare interna server.' });
    }
}
