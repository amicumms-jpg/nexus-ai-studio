window.generateTextToVideo = async function() {
    const inputEl = document.getElementById('textToVideoInput');
    const result = document.getElementById('textToVideoResult');
    const prompt = inputEl ? inputEl.value.trim() : '';

    if (!prompt) {
        window.showToast('Introdu descrierea!', 'error');
        return;
    }

    if (result) {
        result.innerHTML = '<div class="text-cyanNeon animate-pulse">Se trimite cererea către /api/video...</div>';
    }

    try {
        const res = await fetch('/api/video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                model: 'kling',
                aspectRatio: '16:9',
                duration: 5
            })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.error || `Eroare HTTP ${res.status}`);
        }

        if (data.videoUrl) {
            result.innerHTML = `
                <div class="space-y-2">
                    <div class="text-emerald-400 font-bold">Video generat (${escapeHtml(data.model || 'video')})</div>
                    <video src="${escapeHtml(data.videoUrl)}" controls class="w-full rounded-xl border border-gray-700"></video>
                </div>
            `;
            window.showToast('Video generat!', 'success');
            return;
        }

        result.innerText = data.jobId
            ? `Cererea este în curs de procesare (Job ID: ${data.jobId}).`
            : 'Cererea video a fost trimisă cu succes.';
        window.showToast('Cerere trimisă!', 'info');
    } catch (e) {
        if (result) {
            result.innerHTML = `<div class="text-red-400">Eroare la generare: ${escapeHtml(e.message)}</div>`;
        }
    }
};
