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

    let contentsParts = [];

    // Dacă utilizatorul adaugă o imagine, o trimitem corect structurată
    if (fileData && fileData.base64 && fileData.mimeType) {
      contentsParts.push({
        inlineData: {
          mimeType: fileData.mimeType,
          data: fileData.base64
        }
      });
    }

    // Adăugăm textul trimis de utilizator
    contentsParts.push({
      text: prompt
    });

    // URL-ul complet, corect și oficial de la Google Gemini
    const googleResponse = await fetch(
      `https://googleapis.com{apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ parts: contentsParts }]
        })
      }
    );

    if (!googleResponse.ok) {
      const errorText = await googleResponse.text();
      console.error("Gemini API Error details:", errorText);
      return res.status(googleResponse.status).json({ error: `Eroare de la serverele Google: ${googleResponse.status}` });
    }

    const data = await googleResponse.json();
    
    // Extragem textul generat în siguranță din structura oficială Google
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Răspuns gol primit de la AI.";

    // Îi dăm frontend-ului răspunsul curat în formatul pe care îl așteaptă
    return res.status(200).json({ text: responseText });

  } catch (error) {
    console.error("Chat API error:", error);
    return res.status(500).json({ error: error.message || 'Eroare internă de server.' });
  }
}
