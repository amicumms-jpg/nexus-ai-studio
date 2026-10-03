const { GoogleGenerativeAI } = require("@google/generative-ai");

module.exports = async (req, res) => {
  // Permite doar cereri POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt-ul este obligatoriu.' });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return res.status(200).json({ text });
  } catch (error) {
    console.error("Eroare Gemini API:", error);
    return res.status(500).json({ error: "Eroare la procesarea cererii.", details: error.message });
  }
};
