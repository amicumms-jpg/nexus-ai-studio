export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      prompt,
      duration = 5,
      aspectRatio = '16:9',
      model = 'kling'
    } = req.body || {};

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Promptul video este obligatoriu.' });
    }

    const apiKey = process.env.FAL_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Lipsește variabila de mediu FAL_KEY pe server.'
      });
    }

    const cleanPrompt = prompt.trim();
    const safeDuration = Number(duration) === 10 ? '10' : '5';
    const safeAspectRatio = ['9:16', '1:1', '16:9'].includes(aspectRatio) ? aspectRatio : '16:9';

    // Modele text-to-video pe fal.ai
    const modelEndpoints = {
      default: 'fal-ai/kling-video/v1/standard/text-to-video',
      kling: 'fal-ai/kling-video/v1/standard/text-to-video',
      luma: 'fal-ai/luma-dream-machine'
    };

    const selectedModelKey = String(model || 'kling').toLowerCase();
    const endpointPath = modelEndpoints[selectedModelKey] || modelEndpoints.default;
    const falUrl = `https://fal.run/${endpointPath}`;

    const payload =
      selectedModelKey === 'luma'
        ? { prompt: cleanPrompt, aspect_ratio: safeAspectRatio }
        : { prompt: cleanPrompt, aspect_ratio: safeAspectRatio, duration: safeDuration };

    const falRes = await fetch(falUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await falRes.json().catch(() => ({}));

    if (!falRes.ok) {
      return res.status(falRes.status).json({
        error: data.detail || data.error || `Eroare de la providerul video (${falRes.status}).`
      });
    }

    const videoUrl =
      data?.video?.url ||
      data?.data?.video?.url ||
      data?.output?.url ||
      data?.video_url ||
      null;

    if (videoUrl) {
      return res.status(200).json({
        status: 'completed',
        provider: 'fal.ai',
        model: selectedModelKey,
        videoUrl
      });
    }

    const jobId = data?.request_id || data?.jobId || null;
    return res.status(202).json({
      status: data?.status || 'processing',
      provider: 'fal.ai',
      model: selectedModelKey,
      jobId,
      raw: data
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || 'Eroare la procesarea cererii video.'
    });
  }
}
