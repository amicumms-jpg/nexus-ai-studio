import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, fileData } = req.body;
        
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Eroare: GEMINI_API_KEY nu este setată în Vercel!' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        let contentsParts = [];
        if (prompt) {
            contentsParts.push(prompt);
        } else {
            contentsParts.push("Analizează acest fișier:");
        }

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
        console.error("Eroare detaliată server API chat:", error);
        // Trimitem eroarea exactă înapoi în frontend pentru a o vedea imediat
        return res.status(500).json({ 
            error: "Eroare Server: " + (error.message || JSON.stringify(error)) 
        });
    }
}
