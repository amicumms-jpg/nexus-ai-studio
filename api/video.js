export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      prompt,
      duration = 5,
      aspectRatio = '16:9',
      model = 'default'
    } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Promptul video este obligatoriu.' });
    }

    const cleanPrompt = prompt.trim();

    // Aici vei conecta providerul video ales (cu cheia din process.env)
    // și vei returna videoUrl sau jobId/status dacă generarea este asincronă.
    return res.status(501).json({
      error: 'Providerul video nu este încă legat în api/video.js.',
      received: {
        prompt: cleanPrompt,
        duration: Number(duration) || 5,
        aspectRatio,
        model
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Eroare la procesarea cererii video.' });
  }
}
