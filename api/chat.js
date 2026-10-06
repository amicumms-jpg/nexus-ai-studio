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

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'Eroare: GEMINI_API_KEY nu este configurata in Vercel!' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

        let retries = 3; // Încearcă de maximum 3 ori dacă dă eroarea 503
        let delay = 1000; // Așteaptă 1 secundă între încercări
        let result;

        while (retries > 0) {
            try {
                result = await model.generateContent(prompt);
                break; // Dacă are succes, oprește bucla
            } catch (apiError) {
                // Dacă eroarea este 503 (Service Unavailable), mai încercăm o dată
                if (apiError.message && apiError.message.includes("503") && retries > 1) {
                    retries--;
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw apiError; // Dacă este altă eroare sau s-au terminat încercările, o trimitem mai departe
                }
            }
        }

        const responseText = result.response.text();
        return res.status(200).json({ text: responseText });

    } catch (error) {
        console.error("Gemini SDK Error:", error);
        return res.status(500).json({ error: error.message || 'Eroare interna server.' });
    }
}
