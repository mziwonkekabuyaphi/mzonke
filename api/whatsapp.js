export default async function handler(req, res) {

  // 1. VERIFY webhook (Meta handshake)
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  }

  // 2. RECEIVE messages
  if (req.method === "POST") {
    const body = req.body;

    console.log("📩 WhatsApp message received:", JSON.stringify(body, null, 2));

    return res.sendStatus(200);
  }
}
