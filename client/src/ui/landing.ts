import { SERVER_URL } from '../core/config';

const ADJ = ['amber', 'marble', 'gilded', 'quiet', 'velvet', 'bronze', 'jade', 'ivory', 'cobalt', 'crimson', 'golden', 'secret'];
const NOUN = ['falcon', 'sphinx', 'mammoth', 'canvas', 'pharaoh', 'griffin', 'statue', 'mosaic', 'scarab', 'obelisk', 'curator', 'relic'];
/** Same slug shape as the server's, for when the server is slow to answer. */
const localSlug = () => `${ADJ[Math.floor(Math.random() * ADJ.length)]}-${NOUN[Math.floor(Math.random() * NOUN.length)]}-${100 + Math.floor(Math.random() * 900)}`;

const CSS = `
.landing{position:fixed;inset:0;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 30%,#3a3128 0%,#15120f 70%);color:#f3ead9;text-align:center;padding:16px}
.landing h1{font-weight:400;letter-spacing:.35em;font-size:clamp(28px,7vw,64px);margin:0 0 6px}
.landing p{opacity:.75;margin:0 0 28px;font-style:italic}
.landing button{font:inherit;font-size:20px;letter-spacing:.08em;padding:16px 36px;border-radius:999px;border:1px solid #c9a24f;background:#c9a24f;color:#1b1610;cursor:pointer}
.landing button:disabled{opacity:.6;cursor:wait}
.landing small{display:block;margin-top:18px;opacity:.6;min-height:1.4em}
`;

/** The site root: one button, "Start a party" (brief §12.1). */
export function showLanding() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'landing';
  el.innerHTML = `<div><h1>THE MUSEUM</h1><p>After hours. Bring friends. Touch everything.</p>
    <button id="start">Start a party</button><small id="msg"></small></div>`;
  document.body.appendChild(el);
  const btn = el.querySelector<HTMLButtonElement>('#start')!;
  const msg = el.querySelector<HTMLElement>('#msg')!;
  btn.onclick = async () => {
    btn.disabled = true;
    // A sleeping free-tier server can take up to a minute to wake: keep trying for a while.
    for (let attempt = 0; attempt < 12; attempt++) {
      msg.textContent = attempt ? `Waking the museum… (${attempt * 5}s)` : 'Waking the museum…';
      try {
        const res = await fetch(`${SERVER_URL}/api/party`, { method: 'POST', signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`server said ${res.status}`);
        const { slug } = (await res.json()) as { slug: string };
        location.assign(`/party/${slug}${location.search}`);
        return;
      } catch (e) {
        console.warn('party request failed', SERVER_URL, e);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    btn.disabled = false;
    msg.textContent = `Could not reach the museum server at ${SERVER_URL}. Check that it is running, then try again.`;
    // The party link itself doesn't need the server; offer one anyway.
    const a = document.createElement('a');
    a.href = `/party/${localSlug()}${location.search}`;
    a.textContent = 'Open a party link anyway';
    a.style.cssText = 'display:block;margin-top:10px;color:#c9a24f';
    msg.appendChild(a);
  };
}
