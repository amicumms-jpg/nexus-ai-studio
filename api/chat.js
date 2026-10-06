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

        const response = await fetch(`https://googleapis.com{apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        // Citim răspunsul brut de la Google ca text mai întâi pentru siguranță
        const responseTextRaw = await response.text();
        
        let data;
        try {
            data = JSON.parse(responseTextRaw);
        } catch (e) {
            return res.status(500).json({ error: "Raspuns invalid de la Google API: " + responseTextRaw });
        }

        if (data.error) {
            return res.status(data.error.code || 400).json({ error: data.error.message });
        }

        // Extragerea corectă și sigură a textului din structura Gemini API [0]
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
            const aiResponseText = data.candidates[0].content.parts[0].text;
            return res.status(200).json({ text: aiResponseText });
        } else {
            return res.status(500).json({ error: 'Structura raspunsului de la Google este neasteptata.', raw: data });
        }

    } catch (error) {
        console.error("Gemini Native Fetch Error:", error);
        return res.status(500).json({ error: error.message || 'Eroare interna server.' });
    }
}
