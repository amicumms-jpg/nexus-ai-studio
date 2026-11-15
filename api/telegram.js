export default async function handler(req, res) {
    // Setează antetele CORS pentru siguranță
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Tratare preflight OPTIONS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Răspuns rapid pentru GET sau cereri fără mesaj valid de la Telegram
    if (req.method === 'GET' || !req.body || !req.body.message) {
        return res.status(200).json({ status: "Telegram webhook endpoint is active." });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!token || !geminiApiKey) {
        console.error("Lipsește TELEGRAM_BOT_TOKEN sau GEMINI_API_KEY în variabilele de mediu.");
        return res.status(200).json({ ok: false, error: "Missing environment variables" });
    }

    const chatId = req.body.message.chat.id;
    const userMessage = req.body.message.text || "";

    // Dacă utilizatorul a trimis altceva în afară de text (ex: poză, sticker)
    if (!userMessage) {
        await sendTelegramMessage(token, chatId, "Te rog să trimiți un mesaj text pentru a putea discuta cu asistentul AI! 🤖");
        return res.status(200).json({ ok: true });
    }

    let replyText = "Întâmpin o mică problemă tehnică în comunicarea cu serverul AI. Te rog să încerci din nou!";

    try {
        // Poți schimba modelul aici dacă este nevoie (ex: 'gemini-1.5-flash', 'gemini-2.0-flash' etc.)
        const activeModel = 'gemini-1.5-flash'; 
        
        // Apel către Google Gemini API cu timeout de siguranță (10 secunde)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                system_instruction: {
                    parts: [{
                        text: "Ești Asistentul Virtual Oficial Nexus AI Studio Pro (nexusaistudio.ro) pe Telegram. Ajută utilizatorii cu ghidaj despre module și abonament. Răspunde scurt, prietenos și util în limba română."
                    }]
                },
                contents: [{ parts: [{ text: userMessage }] }]
            })
        });

        clearTimeout(timeoutId);
        const data = await aiResponse.json();

        if (!aiResponse.ok) {
            console.error("Eroare Google Gemini API:", JSON.stringify(data));
        } else if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            replyText = data.candidates[0].content.parts[0].text;
        }

    } catch (apiErr) {
        if (apiErr.name === 'AbortError') {
            console.error("Eroare: Timpul de răspuns de la Gemini a expirat (Timeout).");
            replyText = "Serverul AI a durat prea mult să răspundă. Te rog să revii cu o cerere.";
        } else {
            console.error("Eroare conexiune Gemini:", apiErr.message || apiErr);
        }
    }

    // Trimitem răspunsul final înapoi către Telegram
    await sendTelegramMessage(token, chatId, replyText);

    return res.status(200).json({ ok: true });
}

// Funcție ajutătoare pentru trimiterea mesajelor pe Telegram
async function sendTelegramMessage(token, chatId, text) {
    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown'
            })
        });
    } catch (err) {
        console.error("Eroare la trimiterea mesajului pe Telegram:", err);
    }
}
