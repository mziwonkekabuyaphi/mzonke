export default async function handler(req, res) {
  // =========================
  // 1. META WEBHOOK VERIFICATION (GET)
  // =========================
  if (req.method === "GET") {
    try {
      console.log("🔐 VERIFY REQUEST RECEIVED");

      const mode = req.query?.["hub.mode"];
      const token = req.query?.["hub.verify_token"];
      const challenge = req.query?.["hub.challenge"];

      if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
        console.log("✅ WEBHOOK VERIFIED");
        return res.status(200).send(challenge);
      }

      console.log("❌ VERIFY FAILED");
      return res.status(403).end();

    } catch (err) {
      console.error("❌ VERIFY ERROR:", err);
      return res.status(500).end();
    }
  }

  // =========================
  // 2. RECEIVE WHATSAPP MESSAGES (POST)
  // =========================
  if (req.method === "POST") {
    try {
      console.log("🔥 WEBHOOK HIT");

      const body = req.body;

      const value = body?.entry?.[0]?.changes?.[0]?.value;

      // ⚠️ IMPORTANT:
      // Meta sends BOTH:
      // - messages (user messages)
      // - statuses (delivery updates)
      const message = value?.messages?.[0];

      if (!message) {
        console.log("ℹ️ Not a user message (status update ignored)");
        return res.status(200).end();
      }

      const phone = message.from;
      const text = (message.text?.body || "").trim().toLowerCase();
      const messageId = message.id;

      console.log("📩 MESSAGE:", { phone, text, messageId });

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
      // 4. SEND MESSAGE TO WHATSAPP
      // =========================
      const url = `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: reply },
        }),
      });

      const result = await response.json();

      console.log("📤 WHATSAPP RESPONSE:", result);

      return res.status(200).end();

    } catch (err) {
      console.error("❌ POST ERROR:", err);
      return res.status(200).end();
    }
  }

  return res.status(405).end();
}
