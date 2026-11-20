export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, width = 1024, height = 1024, model = 'flux' } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Promptul este obligatoriu.' });
    }

    const cleanPrompt = prompt.trim();
    const seed = Math.floor(Math.random() * 1000000000);
    const encodedPrompt = encodeURIComponent(cleanPrompt);

    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${Number(width) || 1024}&height=${Number(height) || 1024}&model=${encodeURIComponent(model)}&seed=${seed}&nologo=true`;

    return res.status(200).json({
      imageUrl,
      prompt: cleanPrompt,
      seed
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Eroare la generarea URL-ului imaginii.' });
  }
}
