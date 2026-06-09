export default async function handler(req, res) {
  // =========================
  // 1. META WEBHOOK VERIFY
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
  // 2. RECEIVE MESSAGES
  // =========================
  if (req.method === "POST") {
    try {
      const body = req.body;

      const message =
        body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (!message) return res.sendStatus(200);

      const phone = message.from;
      const text = (message.text?.body || "").trim().toLowerCase();
      const messageId = message.id;

      console.log("📩 Incoming:", { phone, text, messageId });

      // =========================
      // 3. DEDUPLICATION (IMPORTANT)
      // Meta sometimes sends same message twice
      // =========================
      const isDuplicate = await checkDuplicate(messageId);
      if (isDuplicate) {
        console.log("⚠️ Duplicate message ignored");
        return res.sendStatus(200);
      }

      await saveMessageLog(phone, text, messageId);

      // =========================
      // 4. INTENT ROUTER (CLEAN)
      // =========================
      const reply = await handleIntent(text, phone);

      // =========================
      // 5. SEND RESPONSE
      // =========================
      await sendWhatsApp(phone, reply);

      return res.sendStatus(200);
    } catch (err) {
      console.error("❌ WEBHOOK ERROR:", err);
      return res.sendStatus(200);
    }
  }

  return res.sendStatus(405);
}
