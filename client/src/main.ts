import { flags, partySlugFromPath } from './core/config';
import { showLanding } from './ui/landing';

/**
 * Entry. The site root offers one button, "Start a party"; /party/<slug> joins
 * that party. ?offline renders the museum without a server (art review, screenshots).
 */
async function boot() {
  const slug = partySlugFromPath();
  if (!slug && !flags.offline && !flags.cam) {
    showLanding();
    return;
  }
  const { Game } = await import('./game');
  const game = new Game(slug);
  await game.start();
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;position:fixed;top:0;left:0;padding:16px;white-space:pre-wrap">${String(e?.stack ?? e)}</pre>`);
});
