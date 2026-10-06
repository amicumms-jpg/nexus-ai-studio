import { GoogleGenerativeAI } from "@google/generative-ai";

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

        // 2. Extragem cheia API trimisă securizat din browser sau cea din Vercel
        const userApiKey = req.headers['x-api-key'] || process.env.GEMINI_API_KEY;
        if (!userApiKey) {
            return res.status(401).json({ error: 'Cheia API lipseste complet.' });
        }

        // 3. Inițializăm SDK-ul oficial de la Google cu cheia extrasă
        const genAI = new GoogleGenerativeAI(userApiKey);
        
        // 4. Apelăm modelul curent stabil recomandat
        const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

        // 5. Generăm conținutul
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // 6. Returnăm răspunsul de succes în format JSON
        return res.status(200).json({ text: responseText });

    } catch (error) {
        console.error("Gemini API Error:", error);
        return res.status(500).json({ error: error.message || 'Eroare interna server.' });
    }
}
