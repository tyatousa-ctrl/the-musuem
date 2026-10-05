# Headset tests

I can't put on a Quest, so this is your checklist. Run it after each milestone, and note the result and anything odd under each item (or tell Claude).

**Setup.** Either connect the Quest over USB and run `adb reverse tcp:5173 tcp:5173 && adb reverse tcp:2567 tcp:2567`, or use the Render URL. In Quest Browser, open `http://localhost:5173/?perf&buttons`, start a party, then press **Enter VR**.

## M1 — The building

- [ ] **Scale on the steps.** Standing on the front steps, the facade should feel *big*: columns well over your head, banners hanging high. You should look up without meaning to. Note it if it feels toy-sized or too huge.
- [ ] **Lobby "wow".** Walk through the centre door. The three domes with bright oculi, the balcony ring and the grand stairs should read as one grand hall. Is the light shaft too bright, or flickering?
- [ ] **Frame rate in the worst rooms.** With the perf panel on (F3 on desktop; `?perf` in VR shows it in front of your face), stand in each place below and note fps:
  - the lobby centre
  - the south end of the Dinosaur Hall looking north
  - the North Court looking at the glass wall

  **Good** means 72 fps or more, steady, with no hitches when turning. Note the draw and tris numbers too.
- [ ] **Room contrast.** Walk lobby → Egypt (should feel tight and dim) → North Court (should feel blazing and vast). Then galleries (jewel-coloured walls) → service level (ugly concrete, cold light).
- [ ] **Culling pops.** Watch doorways as you walk through. Rooms appearing or vanishing should not be noticeable. Note any doorway where geometry pops in.

## M2 — Moving and hands

- [ ] **Comfort.** Smooth locomotion with the left stick and snap turn with the right should cause no nausea. The vignette should darken the edges while moving and clear when stopped. Too strong or too weak?
- [ ] **Walls.** Lean your real head into a wall: the view should fade to black, not show the void behind. Walk into walls with the stick: you should slide along them.
- [ ] **Stairs.** Climb the lobby grand stairs, a Dinosaur Hall catwalk stair, and a court stairwell down to the service level. All should feel smooth with no bumping.
- [ ] **Crawl shaft.** In Egypt, behind the sarcophagus by the Offering Hall's north wall, crouch for real and crawl through the low opening.
- [ ] **Secret door.** In the Mastaba Hall's north wall, find the false-door relief. Grip it near the door to open it.
- [ ] **Hands.** The gloves follow the controllers; grip curls the fingers. In the lobby, pick up a bust or the vase on the information desk and throw it: does it fly where you threw it?
- [ ] **Menu button (open question 1).**
  1. With `?buttons` on, look at your left wrist and press the **left menu button** (the ≡ button).
  2. Report what appears after `L` in the readout, and whether `menu=<n>` appears.
  3. Check both fallbacks work: hold **Y** for half a second, and poke the gold wrist button with your right index finger.
- [ ] **Recenter.** Turn your real body 90°, open the menu and press **Recenter**. Forward should now be where you face.
- [ ] **Seated.** Try playing seated: is the height sensible?

## M3 — Two players

- [ ] **Joining.** Two headsets, or one headset plus desktop, open the same `/party/<slug>` link with no typing and see each other in the lobby.
- [ ] **Avatars.** Heads turn with real head motion and hands move smoothly. Note any jitter or lag above about a quarter-second.
- [ ] **Reconnect.** Take the headset off for 20 s (or toggle Wi-Fi), then come back: you should be the same player.

## M4 — Menus

- [ ] **Lobby totem.** Readable from about 1.5 m; buttons hittable with the trigger ray. Non-hosts see locked controls.
- [ ] **Personal menu.** Appears about 1.3 m in front at chest height, never in your face. Others see a ☰ icon over your head while it's open.
- [ ] **Music and FX.** They toggle independently and the setting persists after a reload.

## M5 — Capture the Relic

- [ ] **Punching glass.** Punch the enemy case hard: the first hit cracks it (sharp sound plus haptic), the second shatters it and the alarm sounds. Is the punch speed threshold right? Too easy or too hard?
- [ ] **Carrying.** Grab the relic and run home. Can you hear its hum? Does the carrier slow-down (0.9×) feel fair?
- [ ] **Shoving.** Shove an opponent: you should see knockback, and about 5 shoves knocks them out. Being knocked out: the screen fades, you see stars, then you respawn at base.
- [ ] **Returning.** Touch your own dropped relic: it should return instantly with "YOUR RELIC IS HOME".
- [ ] **Alarm.** Can you hear the alarm direction from the next room?

## M6 — Artifact Hunt

- [ ] **Starting a hunt.** Pick Artifact Hunt on the totem and press Start. The Registrar's Desk ring and sign appear around the information desk.
- [ ] **The hint.** Look at your left wrist: it should show Cold, Warm, Hot or Burning. Walk toward a glowing artifact: does the hint and the faster ticking sound help you find it?
- [ ] **Spotting them.** Are artifacts easy to see? Commons are terracotta, rares are gold, legendaries are a violet-glowing crown. Note any that are too hard to see or too hard to reach. Hidden ones are in the service level, past the Egypt false door, and through the crawl shaft.
- [ ] **Picking up.** Grab an artifact from the floor and from the top of a bench. Does reaching down feel OK?
- [ ] **Delivering.** Walk into the gold ring at the desk while holding an artifact. You should hear a chime and see "+1/+3/+5".
- [ ] **Teams.** Switch the totem to Teams and play 2v2.
