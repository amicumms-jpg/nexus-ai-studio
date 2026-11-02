import { DEPARTMENTS } from '../agentsConfig.js';

// Mărește timpul maxim de execuție pe Vercel la 30 de secunde (evită eroarea 504)
export const maxDuration = 30;

export default async function handler(req, res) {
    // Setează antetele CORS pentru a permite apeluri din orice browser/interfață
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Tratare preflight OPTIONS (trimisă automat de browsere înainte de POST)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Permitem și verificarea simplă din browser (GET)
    if (req.method === 'GET') {
        return res.status(200).json({ status: 'Chat API endpoint is active (Instant Streaming enabled).' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, message, fileData, department, toolType } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'Cheia GEMINI_API_KEY nu este setată în Vercel!' });
        }

        // Acceptă atât `prompt` cât și `message`
        const userPrompt = prompt || message || "Analizează acest fișier:";

        let parts = [{ text: userPrompt }];

        if (fileData && fileData.base64 && fileData.mimeType) {
            parts.push({
                inlineData: {
                    mimeType: fileData.mimeType,
                    data: fileData.base64
                }
            });
        }

        // Gestionăm rolul specializat în funcție de unealta accesată din Free Tools Hub
        let specializedRoleDescription = "Ești Asistentul Virtual Oficial Nexus AI Studio Pro (nexusaistudio.ro).";

        switch (toolType) {
            case 'chat':
                specializedRoleDescription = "Ești un expert avansat în cercetare, logică și programare.";
                break;
            case 'imageGen':
                specializedRoleDescription = "Ești un specialist în ingineria prompturilor vizuale pentru generare de imagini de înaltă calitate. Generează prompturi vizuale detaliate în engleză pe baza cererii utilizatorului.";
                break;
            case 'pdfTools':
                specializedRoleDescription = "Ești un expert în analiza, extragerea și sinteza documentelor, contractelor și fișierelor PDF.";
                break;
            case 'slides':
                specializedRoleDescription = "Ești un expert în crearea de pitch deck-uri și structuri de prezentări profesionale.";
                break;
            case 'writing':
                specializedRoleDescription = "Ești un copywriter profesionist și editor de text. Corectează, reformulează și optimizează stilul textului.";
                break;
            case 'automations':
                specializedRoleDescription = "Ești un expert în automatizări de fluxuri de lucru, scripturi și integrare de API-uri.";
                break;
            case 'design':
                specializedRoleDescription = "Ești un designer UI/UX și specialist în elemente grafice rapide.";
                break;
            case 'videoGen':
                specializedRoleDescription = "Ești un scenarist și expert în producție video scurtă.";
                break;
            default:
                break;
        }

        const systemInstruction = {
            parts: [{
                text: `${specializedRoleDescription}
Rolul tău secundar este să ajuți utilizatorii să navigheze pe platformă, să le oferi suport rapid și să le explici modelul de susținere a proiectului.

REGULI ȘI GHIDAJ:
1. GHIDAJ MODULE: Când utilizatorul întreabă ce poate face pe site, recomandă-i modulele potrivite.
2. SUPORT & FAQ: Răspunde scurt și clar. Pentru contact direct: contact@nexusaistudio.ro.
3. SUSȚINERE & DONAȚII: Platforma funcționează pe bază de donații voluntare (prin Revolut Me) pentru acoperirea costurilor de API și servere, iar susținătorii pot primi chei VIP de acces prioritare.
4. TON DE COMUNICARE: Fii amabil, concis, profesionist și direct la subiect.`
            }]
        };

        // Folosim modelul oficial stabil care funcționează impecabil cu noile chei generate
        const activeModel = 'gemini-1.5-flash';

        // Setăm antetele critice pentru streaming IMEDIAT înainte de fetch
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        // Mecanism de auto-retry pentru a ocoli erorile temporare 503 / High Demand de la Google
        let apiResponse;
        let attempts = 0;
        const maxRetries = 2;

        while (attempts <= maxRetries) {
            apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:streamGenerateContent?alt=sse&key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: systemInstruction,
                    contents: [{ parts: parts }]
                })
            });

            if (apiResponse.ok) break;

            // Dacă primim eroare de server (503 sau 500), reîncercăm automat după 1.5 secunde
            if (apiResponse.status >= 500 && attempts < maxRetries) {
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 1500));
                continue;
            }

            break;
        }

        if (!apiResponse.ok) {
            const errBody = await apiResponse.text();
            throw new Error(`Eroare Google Gemini API (${apiResponse.status}): ${errBody}`);
        }

        const reader = apiResponse.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            res.write(chunk);

            if (typeof res.flush === 'function') {
                res.flush();
            }
        }

        res.end();

    } catch (error) {
        console.error("Eroare server API chat:", error);
        if (!res.headersSent) {
            if (error.message.toLowerCase().includes('quota') || error.message.includes('429')) {
                return res.status(200).json({ error: 'QUOTA_EXCEEDED' });
            }
            return res.status(500).json({ error: error.message || 'Eroare internă de server.' });
        } else {
            res.end();
        }
    }
}
