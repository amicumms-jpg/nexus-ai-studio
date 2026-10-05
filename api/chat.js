export default async function handler(req, res) { 
  // Permitem doar solicitări de tip POST 
  if (req.method !== 'POST') { 
    return res.status(405).json({ error: 'Method not allowed' }); 
  } 
 
  const { prompt } = req.body; 
  const apiKey = process.env.GEMINI_API_KEY; 
 
  if (!apiKey) { 
    return res.status(500).json({ error: 'Cheia GEMINI_API_KEY nu este configurata in 
Vercel.' }); 
  } 
 
  try {
    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apikey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await apiRes.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

