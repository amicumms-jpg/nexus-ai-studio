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
        return res.status(200).json({ status: 'Chat API endpoint is active.' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, message, fileData, model, department, toolType } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'Cheia GEMINI_API_KEY nu este setată în Vercel!' });
        }

        // Acceptă atât `prompt` cât și `message` (pentru compatibilitate cu diverse widget-uri)
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
                specializedRoleDescription = "Ești un expert avansat în cercetare, logică și programare (alternativă de top pentru DeepSeek).";
                break;
            case 'imageGen':
                specializedRoleDescription = "Ești un specialist în ingineria prompturilor vizuale pentru generare de imagini de înaltă calitate (stil Midjourney/Ideogram). Generează prompturi vizuale detaliate în engleză pe baza cererii utilizatorului.";
                break;
            case 'pdfTools':
                specializedRoleDescription = "Ești un expert în analiza, extragerea și sinteza documentelor, contractelor și fișierelor PDF.";
                break;
            case 'slides':
                specializedRoleDescription = "Ești un expert în crearea de pitch deck-uri și structuri de prezentări profesionale (slide cu slide).";
                break;
            case 'writing':
                specializedRoleDescription = "Ești un copywriter profesionist și editor de text (stil ProWritingAid). Corectează, reformulează și optimizează stilul textului.";
                break;
            case 'automations':
                specializedRoleDescription = "Ești un expert în automatizări de fluxuri de lucru, scripturi și integrare de API-uri (stil Bardeen).";
                break;
            case 'design':
                specializedRoleDescription = "Ești un designer UI/UX și specialist în elemente grafice rapide. Generează cod HTML/CSS curat sau idei de layout pentru bannere și materiale vizuale.";
                break;
            case 'videoGen':
                specializedRoleDescription = "Ești un scenarist și expert în producție video scurtă. Creează cadre, storyboard-uri și prompturi pentru instrumente de tip Runway/Pika.";
                break;
            default:
                break;
        }

        // Prompt de Sistem integrat cu regulile de bază și adaptat pentru Hub
        const systemInstruction = {
            parts: [{
                text: `${specializedRoleDescription}
Rolul tău secundar este să ajuți utilizatorii să navigheze pe platformă, să le oferi suport rapid și să le explici modelul de susținere a proiectului.

REGULI ȘI GHIDAJ:
1. GHIDAJ MODULE: Când utilizatorul întreabă ce poate face pe site, recomandă-i modulele potrivite:
   - Pentru rețele sociale: TikTok AI Creator, Instagram AI Creator, YouTube AI Scriptwriter.
   - Pentru dezvoltare & cod: Code Studio.
   - Pentru marketing & text: Copywriting, Hashtag & SEO Hub, A/B Testing Titluri.
2. SUPORT & FAQ: Răspunde scurt și clar la întrebări despre funcționarea platformei. Menționează că platforma este în faza de testare/Early Access (100% gratuită). Pentru contact direct: contact@nexusaistudio.ro.
3. SUSȚINERE & DONAȚII: Când utilizatorul întreabă despre pachetul PRO, opțiuni avansate sau cum poate ajuta proiectul, explică-i că platforma funcționează pe bază de donații voluntare (prin Revolut Me) pentru acoperirea costurilor de API și servere, iar susținătorii pot primi chei VIP de acces prioritare.
4. TON DE COMUNICARE: Fii amabil, concis, profesionist și direct la subiect.`
            }]
        };

        // Lista de modele ordonate după prioritate
        const modelsPriorityList = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-pro'];

        let apiResponse = null;
        let activeModel = '';
        let rawText = '';
        let data = null;

        // Încercăm modelele în ordine până când unul răspunde cu succes 200 OK
        for (const modelCandidate of modelsPriorityList) {
            activeModel = modelCandidate;
            
            try {
                apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        systemInstruction: systemInstruction,
                        contents: [{ parts: parts }]
                    })
                });

                rawText = await apiResponse.text();

                try {
                    data = JSON.parse(rawText);
                } catch (e) {
                    data = null;
                }

                // Dacă răspunsul este cu succes, oprim căutarea
                if (apiResponse.ok && data && data.candidates) {
                    break;
                }
            } catch (fetchError) {
                console.error(`Erore la modelul ${activeModel}:`, fetchError);
                // Continuă cu următorul model din listă dacă apare o eroare de rețea
                continue;
            }
        }

        if (!apiResponse || !apiResponse.ok) {
            const errMsg = data?.error?.message || '';
            if (errMsg.toLowerCase().includes('quota') || apiResponse?.status === 429) {
                throw new Error('QUOTA_EXCEEDED');
            }
            throw new Error(errMsg || 'Eroare de la serverul Google Gemini');
        }

        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Răspuns gol primit de la AI.";

        return res.status(200).json({ text: responseText, reply: responseText, usedModel: activeModel });

    } catch (error) {
        console.error("Eroare server API chat:", error);

        if (error.message === 'QUOTA_EXCEEDED' || error.message.toLowerCase().includes('quota')) {
            const quotaMessage = "⚠️ Limita de mesaje pentru modelul principal a fost temporar atinsă, iar sistemul a comutat pe rezerva secundară. Pentru acces nelimitat prioritar, poți activa pachetul Nexus Pro VIP din secțiunea de Abonamente!";
            return res.status(200).json({ text: quotaMessage, reply: quotaMessage });
        }

        return res.status(500).json({ error: error.message || 'Eroare internă de server.' });
    }
}
