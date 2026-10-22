import type { ServerEvents } from '@museum/shared';
import type { NetState } from '../multiplayer/net';
import { fmtTime } from '../ui/menus';
import { timer, type ClientMode } from './index';

/**
 * Hide and Seek on the client: the hidden players' calls ("cuck-oo", loud and
 * positional, so seekers can follow them through rooms), no name tags over
 * hiders for seekers, and a countdown to the next call.
 */
let off: (() => void) | null = null;

export const hideSeek: ClientMode = {
  id: 'hideSeek',
  enter(ctx) {
    // Seekers can't spot hiders by their floating name tags.
    ctx.setNameFilter((id) => ctx.net.me()?.team === 'B' && ctx.net.state?.players?.get(id)?.team === 'A');
    off = ctx.net.on('hidePing', (m: ServerEvents['hidePing']) => {
      const mine = m.playerId === ctx.net.playerId;
      ctx.audio.play('cuckoo', mine ? undefined : m.pos, { gain: mine ? 0.6 : 2.2, refDistance: 8, reverb: 0.8 });
    });
  },
  exit(ctx) { off?.(); off = null; ctx.setNameFilter(null); },
  update() {},
  hud(ctx) {
    const s = ctx.net.state, me = ctx.net.me();
    let hidden = 0;
    s.players?.forEach((p: NetState) => { if (p.team === 'A') hidden++; });
    const seeker = me?.team === 'B';
    const left = fmtTime(s.modePhaseEndsAt - ctx.net.serverNow());
    if (s.modePhase === 'hide') return [seeker ? 'You are SEEKING' : 'HIDE!', seeker ? `Counting… ${left}` : `The seeker opens their eyes in ${left}`, timer(ctx)];
    return [
      seeker ? `SEEKING · ${hidden} still hidden` : `Hidden · ${hidden} left`,
      `Next call in ${left}`,
      `${timer(ctx)} left${seeker ? ' · listen for the cuckoo' : ' · move after you call!'}`,
    ];
  },
  corner(ctx) {
    const s = ctx.net.state;
    if (s.phase !== 'playing' && s.phase !== 'countdown') return '';
    const left = fmtTime(s.modePhaseEndsAt - ctx.net.serverNow());
    if (s.modePhase === 'hide') return `${ctx.net.me()?.team === 'B' ? 'Counting' : 'Hide!'}\n${left}`;
    return s.modePhase === 'seek' ? `Next call\n${left}` : '';
  },
};
