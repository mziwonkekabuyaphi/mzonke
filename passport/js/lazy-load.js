// Small helper for loading third-party UMD scripts (QRCode, html2canvas, etc.)
// on demand instead of paying for them on every route via index.html <head>.
// Cached on window so a second page needing the same lib resolves instantly
// even if it points at a different CDN URL for it.
export function loadScriptOnce(src, globalCheck) {
    if (globalCheck()) return Promise.resolve();
    if (!window.__scriptLoadPromises) window.__scriptLoadPromises = {};
    if (window.__scriptLoadPromises[src]) return window.__scriptLoadPromises[src];
    const p = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
    });
    window.__scriptLoadPromises[src] = p;
    return p;
}
