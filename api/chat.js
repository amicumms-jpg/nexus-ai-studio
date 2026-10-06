import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt lipsa' });
        }

        // Citim direct cheia securizată din panoul Vercel
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Eroare: GEMINI_API_KEY nu este configurata in Vercel!' });
        }

        // Inițializăm SDK-ul oficial utilizând cheia stocată în server
        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Apelăm modelul corect cerut în mod obligatoriu de Google
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // Generăm conținutul utilizând funcțiile native stabile ale SDK-ului
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Trimitem înapoi textul curat în format JSON
        return res.status(200).json({ text: responseText });

    } catch (error) {
        console.error("Gemini SDK Error:", error);
        return res.status(500).json({ error: error.message || 'Eroare interna server.' });
    }
}
