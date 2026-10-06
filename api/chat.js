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

        // Citim direct cheia configurată securizat în panoul Vercel
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Eroare: GEMINI_API_KEY nu este configurata in Vercel!' });
        }

        // Inițializăm SDK-ul oficial versiunea 0.21.0 cu cheia din server
        const genAI = new GoogleGenerativeAI(apiKey);
        
        // Folosim modelul Flash din versiunea 2.5, complet suportat și extrem de rapid
       const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

        // Generăm răspunsul utilizând sintaxa nativă a pachetului tău
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Returnăm JSON-ul curat pe care index.html îl așteaptă
        return res.status(200).json({ text: responseText });

    } catch (error) {
        console.error("Gemini API Error:", error);
        return res.status(500).json({ error: error.message || 'Eroare interna server.' });
    }
}
