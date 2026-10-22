export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(200).json({ status: 'Telegram bot endpoint is active.' });
    }

    try {
        const update = req.body;
        
        // Verificăm dacă mesajul conține text de la un utilizator
        if (!update || !update.message || !update.message.text) {
            return res.status(200).json({ ok: true });
        }

        const chatId = update.message.chat.id;
        const userMessage = update.message.text;
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const geminiApiKey = process.env.GEMINI_API_KEY;

        if (!token || !geminiApiKey) {
            console.error("Lipsește token-ul de Telegram sau cheia Gemini.");
            return res.status(500).json({ error: 'Configurație incompletă pe server.' });
        }

        // Prompt de Sistem pentru botul de Telegram
        const systemInstruction = {
            parts: [{
                text: `Ești Asistentul Virtual Oficial Nexus AI Studio Pro (nexusaistudio.ro) pe Telegram.
Ajută utilizatorii cu ghidaj despre module (TikTok AI Creator, Code Studio etc.), suport tehnic și beneficiile abonamentului PRO.
Răspunde prietenos, direct și scurt (max 2-3 propoziții) direct în chatul de Telegram.`
            }]
        };

        // Apelăm Gemini API direct
        const activeModel = 'gemini-3.8-flash';
        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: systemInstruction,
                contents: [{ parts: [{ text: userMessage }] }]
            })
        });

        const data = await aiResponse.json();
        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Salut! Sunt asistentul tău Nexus AI Studio Pro. Cu ce te pot ajuta astăzi?";

        // Trimitem răspunsul înapoi utilizatorului pe Telegram
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: replyText
            })
        });

        return res.status(200).json({ ok: true });

    } catch (error) {
        console.error("Eroare în webhook Telegram:", error);
        return res.status(500).json({ error: error.message });
    }
}
