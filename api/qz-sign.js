// api/qz-sign.js
//
// Server-side signing endpoint for QZ Tray, deployed as a Vercel serverless
// function. QZ Tray's browser client calls this (see qz.security.setSignaturePromise
// in butcher-orders.html / booze-counter.html) to get a signature for each
// print/connect request, proving the request came from a trusted source.
//
// The private key lives ONLY in the Vercel environment variable
// QZ_PRIVATE_KEY_B64 (base64-encoded contents of private-key.pem) — it is
// never sent to the browser and never committed to the repo.
//
// Required Vercel env var:
//   QZ_PRIVATE_KEY_B64 = <base64 of private-key.pem>

const crypto = require('crypto');

module.exports = (req, res) => {
  try {
    const request = req.method === 'GET' ? req.query.request : (req.body && req.body.request);

    if (!request) {
      res.status(400).send('Missing "request" parameter to sign.');
      return;
    }

    const keyB64 = process.env.QZ_PRIVATE_KEY_B64;
    if (!keyB64) {
      console.error('QZ_PRIVATE_KEY_B64 environment variable is not set.');
      res.status(500).send('Signing key not configured.');
      return;
    }

    const privateKey = Buffer.from(keyB64, 'base64').toString('utf8');

    // QZ Tray's default signing algorithm since 2.1 is SHA512withRSA.
    // This MUST match qz.security.setSignatureAlgorithm("SHA512") in the
    // browser-side code, or QZ Tray will reject the signature.
    const signer = crypto.createSign('RSA-SHA512');
    signer.update(request, 'utf8');
    signer.end();
    const signature = signer.sign(privateKey, 'base64');

    res.status(200).send(signature);
  } catch (err) {
    console.error('QZ signing error:', err);
    res.status(500).send('Signing failed.');
  }
};
