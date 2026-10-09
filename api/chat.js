import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, fileData } = req.body;
        if (!prompt && !fileData) {
            return res.status(400).json({ error: 'Prompt sau fișier lipsă.' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Cheia GEMINI_API_KEY nu este configurată în Vercel!' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.0-pro-latest" });

        let contentsParts = [prompt || "Analizează acest fișier:"];

        // Dacă există un fișier trimis în baza64, îl adăugăm în structura multimodală
        if (fileData && fileData.base64 && fileData.mimeType) {
            contentsParts.push({
                inlineData: {
                    data: fileData.base64,
                    mimeType: fileData.mimeType
                }
            });
        }

        const result = await model.generateContent(contentsParts);
        const response = await result.response;
        const responseText = response.text();

        return res.status(200).json({ text: responseText });

    } catch (error) {
        console.error("Eroare server API chat:", error);
        return res.status(500).json({ error: error.message || 'Eroare internă de server.' });
    }
}
