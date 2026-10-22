export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, fileData } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'Cheia GEMINI_API_KEY nu este setată în Vercel!' });
        }

        let parts = [{ text: prompt || "Analizează acest fișier:" }];

        if (fileData && fileData.base64 && fileData.mimeType) {
            parts.push({
                inlineData: {
                    mimeType: fileData.mimeType,
                    data: fileData.base64
                }
            });
        }

        // Prompt de Sistem (Instructiuni pentru Asistentul Nexus AI Studio Pro)
        const systemInstruction = {
            parts: [{
                text: `Ești Asistentul Virtual Oficial Nexus AI Studio Pro (nexusaistudio.ro).
Rolul tău principal este să ajuți utilizatorii să navigheze pe platformă, să le oferi suport rapid (FAQ) și să crești conversia către conturile PRO.

REGULI ȘI GHIDAJ:
1. GHIDAJ MODULE: Când utilizatorul întreabă ce poate face pe site, recomandă-i modulele potrivite:
   - Pentru rețele sociale: TikTok AI Creator, Instagram AI Creator, YouTube AI Scriptwriter.
   - Pentru dezvoltare & cod: Code Studio.
   - Pentru marketing & text: Copywriting, Hashtag & SEO Hub, A/B Testing Titluri.
2. SUPORT & FAQ: Răspunde scurt și clar la întrebări despre erori de generare, funcționarea platformei și plăți securizate prin Stripe. Dacă ai întrebări generale de contact, menționează contact@nexusaistudio.ro.
3. CONVERSIE PRO: Când utilizatorul întreabă despre limite, funcții avansate sau viteza de generare, explică-i beneficiile pachetului PRO și invită-l să deblocheze varianta PRO.
4. TON DE COMUNICARE: Fii amabil, concis (răspunsuri scurte, max 2-4 propoziții), profesionist și direct la subiect.`
            }]
        };

        // Folosim modelul cerut direct de Google API pentru cheia ta nouă
        const activeModel = 'gemini-3.8-flash';
        
        let apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: systemInstruction,
                contents: [{ parts: parts }]
            })
        });

        const rawText = await apiResponse.text();
        let data;

        try {
            data = JSON.parse(rawText);
        } catch (e) {
            throw new Error("Răspuns invalid de la serverul Google: " + rawText.substring(0, 100));
        }

        if (!apiResponse.ok) {
            throw new Error(data.error?.message || 'Eroare de la serverul Google Gemini');
        }

        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Răspuns gol primit de la AI.";

        return res.status(200).json({ text: responseText, reply: responseText });

    } catch (error) {
        console.error("Eroare server API chat:", error);
        return res.status(500).json({ error: error.message || 'Eroare internă de server.' });
    }
}
