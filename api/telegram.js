export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

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

    if (!userMessage) {
        await sendTelegramMessage(token, chatId, "Te rog să trimiți un mesaj text pentru a putea discuta cu asistentul AI! 🤖");
        return res.status(200).json({ ok: true });
    }

    let replyText = "Sistemul AI este momentan suprasolicitat (eroare temporară de rețea). Te rog să revii cu un mesaj în câteva momente!";

    try {
        const activeModel = 'gemini-3.8-flash'; 
        
        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: {
                    parts: [{
                        text: "Ești Asistentul Virtual Oficial Nexus AI Studio Pro (nexusaistudio.ro) pe Telegram. Ajută utilizatorii cu ghidaj despre module și abonament. Răspunde scurt, prietenos și util în limba română."
                    }]
                },
                contents: [{ parts: [{ text: userMessage }] }]
            })
        });

        const data = await aiResponse.json();

        if (!aiResponse.ok) {
            console.error("Eroare Google Gemini API:", JSON.stringify(data));
            // Dacă primim eroare 503, lăsăm mesajul prietenos definit mai sus
        } else if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            replyText = data.candidates[0].content.parts[0].text;
        }

    } catch (apiErr) {
        console.error("Eroare conexiune Gemini:", apiErr.message || apiErr);
    }

    await sendTelegramMessage(token, chatId, replyText);

    return res.status(200).json({ ok: true });
}

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
