export default async function handler(req, res) {
    // 1. Verificăm metoda HTTP
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt lipsa' });
        }

        // 2. Citim cheia ta API din setările Vercel
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Eroare: GEMINI_API_KEY nu este configurata in Vercel!' });
        }

        // 3. Apelăm direct API-ul oficial Google folosind header-ul nativ pentru chei de tip "AQ."
        const response = await fetch("https://googleapis.com", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey // Headerul nativ obligatoriu pentru noile chei Google Auth
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();

        // 4. Verificăm dacă Google a returnat o eroare internă
        if (data.error) {
            return res.status(data.error.code || 400).json({ error: data.error.message });
        }

        // 5. Extragem corect textul generat din structura Gemini API
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
            const responseText = data.candidates[0].content.parts[0].text;
            return res.status(200).json({ text: responseText });
        } else {
            return res.status(500).json({ error: 'Structura raspunsului primita de la Google este invalida.' });
        }

    } catch (error) {
        console.error("Gemini Native Fetch Error:", error);
        return res.status(500).json({ error: error.message || 'Eroare interna server.' });
    }
}
