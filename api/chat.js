import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, tabId, fileData } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt lipsa' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Eroare: GEMINI_API_KEY nu este configurata in Vercel!' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

        // Construim matricea multimodală de conținut conform specificațiilor oficiale Google
        let contentsParts = [];

        // Dacă utilizatorul a atașat o poză, un document sau un video de la frontend
        if (fileData && fileData.base64 && fileData.mimeType) {
            contentsParts.push({
                inlineData: {
                    data: fileData.base64,
                    mimeType: fileData.mimeType
                }
            });
        }

        // Adăugăm textul utilizatorului
        contentsParts.push({ text: prompt });

        let retries = 3;
        let delay = 1000;
        let result;

        while (retries > 0) {
            try {
                result = await model.generateContent({ contents: [{ parts: contentsParts }] });
                break;
            } catch (apiError) {
                if (apiError.message && apiError.message.includes("503") && retries > 1) {
                    retries--;
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw apiError;
                }
            }
        }

        const responseText = result.response.text();
        return res.status(200).json({ text: responseText });

    } catch (error) {
        console.error("Gemini Multimodal Error:", error);
        return res.status(500).json({ error: error.message || 'Eroare interna server.' });
    }
}
