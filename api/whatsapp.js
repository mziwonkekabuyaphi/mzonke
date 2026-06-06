export default async function handler(req, res) {

  // =========================
  // 1. META WEBHOOK VERIFICATION (GET)
  // =========================
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  }

  // =========================
  // 2. RECEIVE WHATSAPP MESSAGES (POST)
  // =========================
  if (req.method === "POST") {
    try {
      const body = req.body;

      const message =
        body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (!message) {
        return res.sendStatus(200);
      }

      const phone = message.from;
      const text = message.text?.body?.toLowerCase();

      console.log("📩 PHONE:", phone);
      console.log("💬 MESSAGE:", text);

      // =========================
      // 3. SIMPLE RULE ENGINE (NO AI)
      // =========================
      let reply = "👋 Welcome! Type: menu | book | balance";

      if (text?.includes("menu")) {
        reply = "🍔 Menu:\n1. Shisha\n2. Drinks\n3. Snacks";
      }

      if (text?.includes("book")) {
        reply = "🎟️ Booking request received.\nChoose time: 6PM / 7PM / 8PM";
      }

      if (text?.includes("balance")) {
        reply = "💰 Wallet system is not connected yet.";
      }

      // =========================
      // 4. SEND MESSAGE BACK TO WHATSAPP
      // =========================
      await fetch(
        `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone,
            type: "text",
            text: { body: reply }
          })
        }
      );

      return res.sendStatus(200);

    } catch (err) {
      console.log("❌ WEBHOOK ERROR:", err);
      return res.sendStatus(200);
    }
  }

  return res.sendStatus(405);
}
🧠 WHAT THIS GIVES YOU
✔ WhatsApp can:
connect to Vercel
send messages to your bot
receive automatic replies
✔ Your bot can:
understand simple commands
reply instantly
run without AI
run without Supabase (for now)
⚙️ REQUIRED ENV VARIABLES

Make sure Vercel has:

VERIFY_TOKEN
WHATSAPP_TOKEN
PHONE_NUMBER_ID
SUPABASE_URL   (not used yet but ready)
SUPABASE_ANON_KEY (not used yet but ready)
🚀 WHAT YOU DO NEXT
Replace your file with this
Commit + push to GitHub
Wait for Vercel deploy
Test WhatsApp message
🔥 WHEN IT WORKS

You will have:

👉 Real WhatsApp bot
👉 Auto replies
👉 Working webhook system

👉 NEXT STEP (IMPORTANT)

After this works, say:

“bot is replying”

Then I’ll upgrade you to:

🧍 auto customer registration (Supabase)
💰 wallet system
🎟️ ticket system
📊 full POS backend

This is where your system becomes a real business platform.
