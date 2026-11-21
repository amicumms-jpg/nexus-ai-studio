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
    const rawKeys = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    const apiKeys = rawKeys
        .split(',')
        .map(k => k.trim())
        .filter(Boolean)
        .sort(() => Math.random() - 0.5);

    if (!token || apiKeys.length === 0) {
        console.error("Lipsește TELEGRAM_BOT_TOKEN sau GEMINI_API_KEY în variabilele de mediu.");
        return res.status(200).json({ ok: false, error: "Missing environment variables" });
    }

    const chatId = req.body.message.chat.id;
    const userMessage = (req.body.message.text || "").trim();

    if (!userMessage) {
        await sendTelegramMessage(
            token,
            chatId,
            "Te rog să trimiți un mesaj text pentru a putea discuta cu asistentul AI! 🤖"
        );
        return res.status(200).json({ ok: true });
    }

    if (userMessage === '/start' || userMessage === '/help') {
        await sendTelegramMessage(
            token,
            chatId,
            "Salut! Sunt asistentul oficial **Nexus AI Studio Pro** (nexusaistudio.ro). Scrie-mi orice întrebare sau idee și îți răspund rapid!"
        );
        return res.status(200).json({ ok: true });
    }

    const modelsToTry = ['gemini-3.8-flash'];
    let replyText = null;
    let lastStatus = null;
    const startTime = Date.now();
    const maxTotalBudgetMs = 24000;

    for (const modelName of modelsToTry) {
        if (Date.now() - startTime > maxTotalBudgetMs) break;

        for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
            if (Date.now() - startTime > maxTotalBudgetMs) break;

            const currentKey = apiKeys[keyIdx];
            let succeeded = false;

            for (let attempt = 1; attempt <= 2; attempt++) {
                if (Date.now() - startTime > maxTotalBudgetMs) break;

                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 9000);

                    const aiResponse = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(currentKey)}`,
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
                    const data = await aiResponse.json().catch(() => ({}));

                    if (aiResponse.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                        replyText = data.candidates[0].content.parts[0].text;
                        succeeded = true;
                        break;
                    }

                    const errMsg = data?.error?.message || `HTTP ${aiResponse.status}`;
                    console.error(`Modelul ${modelName} [Cheia #${keyIdx + 1}, încercarea ${attempt}] a eșuat (${aiResponse.status}): ${errMsg}`);

                    if (aiResponse.status === 429 || aiResponse.status === 401 || aiResponse.status === 403 || /quota|resource_exhausted/i.test(errMsg)) {
                        break;
                    }

                    if (aiResponse.status === 503 && attempt < 2) {
                        await new Promise(resolve => setTimeout(resolve, 600));
                    } else {
                        break;
                    }
                } catch (apiErr) {
                    lastStatus = 503;
                    const reason = apiErr?.name === 'AbortError' ? `Timeout la ${modelName}` : (apiErr?.message || 'Eroare Gemini');
                    console.error(`Eroare la modelul ${modelName} [Cheia #${keyIdx + 1}, încercarea ${attempt}]:`, reason);
                    if (attempt < 2) {
                        await new Promise(resolve => setTimeout(resolve, 600));
                    }
                }
            }

            if (succeeded) break;
        }

        if (replyText) break;
    }

    if (!replyText) {
        if (lastStatus === 429) {
            replyText = "⏳ S-a atins limita zilnică de cereri pe planul gratuit (Free Tier). Te rog să revii mai târziu sau să folosești platforma web nexusaistudio.ro.";
        } else if (lastStatus === 503) {
            replyText = "⚠️ Serverele AI sunt momentan suprasolicitate. Mai încearcă o dată peste câteva secunde!";
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
    const links = [];
    let withPlaceholders = String(text).replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        (_, label, url) => {
            const idx = links.length;
            links.push({ label, url });
            return `@@TGLINK_${idx}@@`;
        }
    );

    let safe = escapeTelegramHtml(withPlaceholders);
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

    links.forEach((item, idx) => {
        const cleanHref = item.url.replace(/"/g, '&quot;');
        const cleanLabel = escapeTelegramHtml(item.label);
        safe = safe.replace(`@@TGLINK_${idx}@@`, `<a href="${cleanHref}">${cleanLabel}</a>`);
    });

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

        const tgData = await tgRes.json().catch(() => ({}));
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
