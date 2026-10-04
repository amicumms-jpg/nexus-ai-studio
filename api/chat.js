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
    const response = await fetch( 
      
`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateConten
t?key=${apiKey}`, 
      { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          contents: [{ parts: [{ text: prompt }] }] 
        }) 
      } 
    ); 
 
    const data = await response.json(); 
 
    if (data.error) { 
      return res.status(400).json({ error: data.error.message || 'Eroare de la Gemini API.' }); 
    } 
 
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Nu am primit un 
răspuns valid.'; 
    return res.status(200).json({ response: replyText }); 
  } catch (error) { 
    return res.status(500).json({ error: 'Eroare de conexiune la server: ' + error.message }); 
  } 
} 
