export default async function handler(req, res) {
  // =========================
  // 1. META WEBHOOK VERIFICATION (GET)
  // =========================
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log("🔐 VERIFY REQUEST RECEIVED");

    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
      console.log("✅ WEBHOOK VERIFIED");
      return res.status(200).send(challenge);
    }

    console.log("❌ VERIFY FAILED");
    return res.sendStatus(403);
  }

  // =========================
  // 2. RECEIVE WHATSAPP MESSAGES (POST)
  // =========================
  if (req.method === "POST") {
    try {
      console.log("🔥 WEBHOOK HIT - META REACHED SERVER");

      const body = req.body;
      console.log("📦 RAW BODY:", JSON.stringify(body, null, 2));

      const message =
        body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (!message) {
        console.log("ℹ️ No message found");
        return res.sendStatus(200);
      }

      const phone = message.from;
      const text = (message.text?.body || "").trim().toLowerCase();
      const messageId = message.id;

      console.log("📩 MESSAGE RECEIVED:", { phone, text, messageId });

      // =========================
      // 3. SIMPLE RULE ENGINE
      // =========================
      let reply = "👋 Welcome! Type: menu | book | balance";

      if (text.includes("menu")) {
        reply = "🍔 Menu:\n1. Shisha\n2. Drinks\n3. Snacks";
      }

      if (text.includes("book")) {
        reply = "🎟️ Booking received.\nChoose: 6PM / 7PM / 8PM";
      }

      if (text.includes("balance")) {
        reply = "💰 Wallet system coming soon.";
      }

      // =========================
      // 4. SEND MESSAGE BACK TO WHATSAPP
      // =========================
      const url = `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`;

      const response = await fetch(url, {
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
      });

      const result = await response.json();

      console.log("📤 WHATSAPP RESPONSE:", result);

      return res.sendStatus(200);

    } catch (err) {
      console.error("❌ WEBHOOK ERROR:", err);
      return res.sendStatus(200);
    }
  }

  return res.sendStatus(405);
}
