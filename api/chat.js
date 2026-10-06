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

        // Citim direct cheia setată în panoul Vercel
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Eroare: Cheia GEMINI_API_KEY nu este configurata in Vercel!' });
        }

        // Inițializăm SDK-ul oficial cu cheia din server
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        return res.status(200).json({ text: responseText });

    } catch (error) {
        console.error("Gemini API Error:", error);
        return res.status(500).json({ error: error.message || 'Eroare interna server.' });
    }
}
