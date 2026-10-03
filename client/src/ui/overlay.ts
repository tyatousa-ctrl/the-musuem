/**
 * The thin DOM layer for desktop (brief §13: allowed for the pre-join page; on
 * desktop the corner HUD is conventional). In VR none of this is visible.
 */
const CSS = `
#ov{position:fixed;inset:0;display:grid;place-items:center;background:rgba(15,12,10,.55);color:#f3ead9;z-index:10;text-align:center;font-family:Georgia,serif;padding:16px}
#ov h1{font-weight:400;letter-spacing:.3em;margin:0 0 4px;font-size:clamp(24px,6vw,48px)}
#ov .sub{opacity:.75;font-style:italic;margin-bottom:22px}
#ov .row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
#ov button.play{font:inherit;font-size:19px;padding:14px 30px;border-radius:999px;border:1px solid #c9a24f;background:#c9a24f;color:#1b1610;cursor:pointer}
#ov .vr button,#ov .vr a{position:static!important;transform:none!important;font:inherit!important;font-size:17px!important;padding:14px 26px!important;border-radius:999px!important;border:1px solid #c9a24f!important;background:transparent!important;color:#f3ead9!important;opacity:1!important;width:auto!important;left:auto!important;bottom:auto!important}
#ov .keys{margin-top:22px;font-size:14px;opacity:.7;line-height:1.7}
#ov .status{margin-top:16px;min-height:1.4em;color:#e9c46a}
#ov .status.err{color:#ff9f8a}
#hud{position:fixed;top:10px;right:12px;z-index:9;color:#f3ead9;font:16px/1.4 Georgia,serif;text-align:right;text-shadow:0 1px 4px #000;pointer-events:none}
#hud b{color:#e9c46a;font-size:19px}
#xh{position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:rgba(243,234,217,.85);box-shadow:0 0 0 2px rgba(0,0,0,.35);z-index:9;pointer-events:none}
#hint{position:fixed;bottom:10px;left:50%;transform:translateX(-50%);color:#f3ead9;opacity:.65;font:13px Georgia,serif;z-index:9;pointer-events:none;text-align:center;white-space:nowrap}
#card{position:fixed;left:50%;top:58%;transform:translateX(-50%);background:rgba(20,16,12,.88);border:1px solid #c9a24f;border-radius:14px;padding:14px 22px;color:#f3ead9;font:17px/1.6 Georgia,serif;z-index:11;display:none;max-width:min(560px,90vw)}
#results{position:fixed;left:50%;top:32%;transform:translateX(-50%);font:600 30px Georgia,serif;color:#e9c46a;text-shadow:0 2px 10px #000;z-index:11;pointer-events:none;text-align:center}
@media (max-width:600px){#hint{display:none}}
`;

export class DesktopOverlay {
  private root: HTMLDivElement;
  private statusEl: HTMLDivElement;
  private vrSlot: HTMLDivElement;
  private hudEl: HTMLDivElement;
  private xh: HTMLDivElement;
  private hint: HTMLDivElement;
  private cardEl: HTMLDivElement;
  private results: HTMLDivElement;
  private lastHud = '';

  constructor(onPlay: () => void, private hidden: boolean) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.id = 'ov';
    this.root.innerHTML = `<div><h1>THE MUSEUM</h1><div class="sub">After hours. Bring friends. Touch everything.</div>
      <div class="row"><button class="play">Play on desktop</button><div class="vr"></div></div>
      <div class="status"></div>
      <div class="keys">WASD move · mouse look · Shift sprint · C crouch<br>E / Q grab with right / left hand · click to punch or throw · F shove · Tab menu</div></div>`;
    document.body.appendChild(this.root);
    this.statusEl = this.root.querySelector('.status')!;
    this.vrSlot = this.root.querySelector('.vr')!;
    this.root.querySelector<HTMLButtonElement>('.play')!.onclick = onPlay;
    this.hudEl = el('hud'); this.xh = el('xh'); this.hint = el('hint'); this.cardEl = el('card'); this.results = el('results');
    this.hint.textContent = 'E grab · click punch/throw · F shove · Tab menu';
    if (hidden) this.hideAll();
  }

  private hideAll() { for (const e of [this.root, this.hudEl, this.xh, this.hint]) e.style.display = 'none'; }

  attachVR(btn: HTMLElement) { this.vrSlot.appendChild(btn); }

  status(text: string, error = false) {
    this.statusEl.textContent = text;
    this.statusEl.classList.toggle('err', error);
    if (text && !this.hidden && this.root.style.display === 'none' && error) this.show();
  }

  show() { if (!this.hidden) this.root.style.display = 'grid'; }
  hide() { this.root.style.display = 'none'; }

  hud(lines: string[], crosshair: boolean, result: string) {
    if (this.hidden) return;
    const html = lines.filter(Boolean).map((l, i) => (i === 0 ? `<b>${esc(l)}</b>` : esc(l))).join('<br>');
    if (html !== this.lastHud) { this.hudEl.innerHTML = html; this.lastHud = html; }
    this.xh.style.display = crosshair ? 'block' : 'none';
    this.hint.style.display = crosshair ? 'block' : 'none';
    this.results.textContent = result;
  }

  card(lines: string[], ms: number) {
    if (this.hidden || !lines.length) return;
    this.cardEl.innerHTML = lines.map(esc).join('<br>');
    this.cardEl.style.display = 'block';
    setTimeout(() => (this.cardEl.style.display = 'none'), ms);
  }
}

function el(id: string) {
  const d = document.createElement('div');
  d.id = id;
  document.body.appendChild(d);
  return d;
}
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
