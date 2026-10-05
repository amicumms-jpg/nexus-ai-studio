import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt } = req.body;
    
    // Inițializăm clientul cu pachetul corect instalat în proiect
    const genAI = new GoogleGenerativeAI("AQ.Ab8RN6KwasoJjU4SN1pamRunUKp1cxkgZQfbsPdkg4upHoUpYg");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return res.status(200).json({ text: text });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}



