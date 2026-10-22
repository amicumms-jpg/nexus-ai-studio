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

    try {
        const update = req.body;

        // Dacă este o verificare simplă din browser (GET)
        if (req.method === 'GET' || !update || !update.message) {
            return res.status(200).json({ status: "Telegram endpoint is active and waiting for POST updates." });
        }

        const chatId = update.message.chat.id;
        const userMessage = update.message.text || "";
        const token = process.env.TELEGRAM_BOT_TOKEN;
        const geminiApiKey = process.env.GEMINI_API_KEY;

        if (!token || !geminiApiKey) {
            console.error("Lipsește TELEGRAM_BOT_TOKEN sau GEMINI_API_KEY.");
            return res.status(200).json({ ok: true });
        }

        let replyText = "Salut! Sunt asistentul tău Nexus AI Studio Pro. Cu ce te pot ajuta astăzi?";

        if (userMessage) {
            try {
                const activeModel = 'gemini-3.8-flash';
                const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${geminiApiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        systemInstruction: {
                            parts: [{
                                text: `Ești Asistentul Virtual Oficial Nexus AI Studio Pro (nexusaistudio.ro) pe Telegram. Ajută utilizatorii cu ghidaj despre module și abonament. Răspunde scurt și prietenos.`
                            }]
                        },
                        contents: [{ parts: [{ text: userMessage }] }]
                    })
                });

                const data = await aiResponse.json();

                // Verificăm dacă API-ul a returnat o eroare
                if (!aiResponse.ok) {
                    console.error("Eroare Google Gemini API:", JSON.stringify(data));
                    replyText = "Întâmpin o mică problemă tehnică în comunicarea cu serverul AI. Te rog să încerci din nou!";
                } else if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    replyText = data.candidates[0].content.parts[0].text;
                }
            } catch (apiErr) {
                console.error("Eroare conexiune Gemini:", apiErr);
                replyText = "A apărut o eroare de rețea la interogarea AI.";
            }
        }

        // Trimitem răspunsul la Telegram
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
        console.error("Eroare generală:", error);
        return res.status(200).json({ ok: true });
    }
}
