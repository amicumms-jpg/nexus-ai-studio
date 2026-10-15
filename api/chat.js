import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, fileData } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt-ul este obligatoriu.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Cheia GEMINI_API_KEY nu este configurată în Vercel!' });
    }

    // Inițializăm SDK-ul Google cu cheia ta API
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Forțăm utilizarea modelului stabil prin denumirea sa completă oficială
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    let contentsParts = [];

    // Dacă utilizatorul trimite o imagine validă, o adăugăm în array
    if (fileData && fileData.base64 && fileData.mimeType) {
      contentsParts.push({
        inlineData: {
          data: fileData.base64,
          mimeType: fileData.mimeType
        }
      });
    }

    // Adăugăm promptul text
    contentsParts.push(prompt);

    // Apelăm funcția din librăria oficială Google
    const result = await model.generateContent(contentsParts);
    const response = await result.response;
    const responseText = response.text();

    // Returnăm răspunsul în formatul așteptat de frontend ca proprietate .text
    return res.status(200).json({ text: responseText });

  } catch (error) {
    console.error("Chat API error:", error);
    return res.status(500).json({ error: error.message || 'Eroare internă de server.' });
  }
}
