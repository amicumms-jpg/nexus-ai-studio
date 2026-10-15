import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, fileData } = req.body;

    // Verificăm dacă măcar prompt-ul există
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt-ul este obligatoriu.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Cheia GEMINI_API_KEY nu este configurată în Vercel!' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Inițializăm array-ul de conținut
    let contentsParts = [];

    // Dacă există fișier valid, îl adăugăm mai întâi în array
    if (fileData && fileData.base64 && fileData.mimeType) {
      contentsParts.push({
        inlineData: {
          data: fileData.base64,
          mimeType: fileData.mimeType
        }
      });
    }

    // Adăugăm textul promptului la finalul array-ului
    contentsParts.push(prompt);

    // Apelăm API-ul Gemini
    const result = await model.generateContent(contentsParts);
    const response = await result.response;
    const responseText = response.text();

    return res.status(200).json({ response: responseText });

  } catch (error) {
    console.error("Chat API error:", error);
    return res.status(500).json({ error: error.message || 'Eroare internă de server.' });
  }
}
