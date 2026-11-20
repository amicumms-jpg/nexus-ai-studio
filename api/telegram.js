export const maxDuration = 30;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
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
    const userMessage = (req.body.message.text || "").trim();

    if (!userMessage) {
        await sendTelegramMessage(token, chatId, "Te rog să trimiți un mesaj text pentru a putea discuta cu asistentul AI! 🤖");
        return res.status(200).json({ ok: true });
    }

    const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest'];
    let replyText = null;
    let lastStatus = null;

    for (const modelName of modelsToTry) {
        let succeeded = false;

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 7000);

                const aiResponse = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`,
                    {
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
                    }
                );

                clearTimeout(timeoutId);
                lastStatus = aiResponse.status;
                const data = await aiResponse.json();

                if (aiResponse.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    replyText = data.candidates[0].content.parts[0].text;
                    succeeded = true;
                    break;
                }

                console.error(`Modelul ${modelName} (încercarea ${attempt}) a eșuat (${aiResponse.status}):`, JSON.stringify(data));

                if (aiResponse.status === 429) {
                    break;
                }

                if (aiResponse.status === 503 && attempt < 2) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (apiErr) {
                console.error(`Eroare la modelul ${modelName} (încercarea ${attempt}):`, apiErr.message || apiErr);
                if (attempt < 2) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        if (succeeded) break;
    }

    if (!replyText) {
        if (lastStatus === 429) {
            replyText = "⏳ Ai atins limita temporară de cereri (429). Încearcă din nou într-un minut!";
        } else if (lastStatus === 503) {
            replyText = "⚠️ Serverele AI sunt momentan suprasolicitate (503). Mai încearcă o dată peste câteva secunde!";
        } else {
            replyText = "⚠️ Serviciul AI este momentan indisponibil. Te rog să reîncerci în câteva secunde!";
        }
    }

    await sendTelegramMessage(token, chatId, replyText);

    return res.status(200).json({ ok: true });
}

function escapeTelegramHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatForTelegramHtml(text) {
    let safe = escapeTelegramHtml(text);
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
    return safe.slice(0, 4000);
}

async function sendTelegramMessage(token, chatId, text) {
    const formattedText = formatForTelegramHtml(text);
    try {
        const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: formattedText,
                parse_mode: 'HTML',
                disable_web_page_preview: false
            })
        });

        const tgData = await tgRes.json();
        if (!tgRes.ok || !tgData.ok) {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: String(text).slice(0, 4000),
                    disable_web_page_preview: false
                })
            });
        }
    } catch (err) {
        console.error("Eroare la trimiterea mesajului pe Telegram:", err);
    }
}
