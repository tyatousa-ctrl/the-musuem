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

## Met-style layout and second floor

- [ ] **Banner.** From the entrance doors, is the "Welcome to The Museum" banner readable and not uncomfortably high?
- [ ] **Scale.** Does the wider Great Hall feel grand but still walkable? Is the Dinosaur Hall too long?
- [ ] **Stairs.** Walk and sprint up the Grand Staircase, the catwalk stairs in the Dinosaur Hall, and the court stairs. Any stutter, sliding or vignette flicker?
- [ ] **Elevators.** Step into a cab (Great Hall corners or courts), point at the panel and press the other floor. Is the fade-and-ding comfortable? Do you face the same way afterwards?
- [ ] **Sprint toggle.** Click the left stick while moving: you should speed up, stay sprinting while you keep moving, and stop sprinting when you let go. Click again to turn it off.
- [ ] **Frame rate.** Look down the Dinosaur Hall and across the Great Hall from the balcony. Note any drops below 72 fps.

## M7 — Crowd Control

- [ ] **Readability.** Can you tell at a glance who is going the wrong way (red marker), who is heading into a closed area (amber), and who is filming (purple, blinking)? Are the floor arrows visible from standing height?
- [ ] **Touching.** Reach out and tap a wrong-way tourist on the shoulder. They should huff, show a speech bubble and turn around. Does a light touch register, or do you have to swipe? Walking into someone should count too.
- [ ] **Groups and guides.** Touch a group follower, then its leader (the one with the flag). Does the whole group follow the leader around?
- [ ] **Stanchions.** Pick up a brass post by its top and carry it. Put two down about 2 m apart: a red rope should appear between them. Do tourists stop at it?
- [ ] **Frame rate.** Stand in the Great Hall during wave 5 with 40 tourists around. Note any drops below 72 fps.
- [ ] **Comfort.** Tourists pass through you. Does that feel OK, or is it unsettling up close?

## M8 — Insurance Fraud

- [ ] **Tools in hand.** Grab the mallet, the fire axe and the sledgehammer by the handle. Do they point the right way out of your hand? Does swinging feel right, and is the sledgehammer's slowness fair?
- [ ] **Hitting.** Smash a vase with your fist, then a bust with the mallet. Is the hit threshold forgiving enough for a tool swing? Do the price tags read at arm's length?
- [ ] **The big pieces.** Loosen the three anchors on the Mammoth (a crowbar is fastest), then bring it down with a heavy tool. Does it feel like an event?
- [ ] **Security.** Watch your stars on the wrist. At level 2, do others see your beacon? At level 4, a guard comes: can you outrun it, and can you lose it by going upstairs?
- [ ] **Caught.** Being held in the basement security office: is 8 s plus the walk back fair, or punishing?
- [ ] **Throwing the stone ball.** Throw it at a statue. Does it register?
- [ ] **Frame rate.** Stand in the Dinosaur Hall near the Mammoth with price tags showing. Note any drops below 72 fps.

## Hide and Seek

- [ ] **Counting.** As the seeker, is the view fully black while counting, with the countdown readable at the bottom right?
- [ ] **The call.** As the seeker, can you tell which direction the "cuck-oo" comes from, and roughly how far? Is it loud enough from two rooms away, and too loud up close?
- [ ] **Tagging.** Reach out and touch a hider. Does it register reliably without needing a swing?
- [ ] **Hiding spots.** Note good and bad spots (behind the T. rex, the service level, the catwalks, the paintings upstairs).

## Fix the Exhibit

- [ ] **The corner countdown.** Is the timer at the bottom right readable without blocking your view?
- [ ] **Eyes closed.** Three seconds of black: comfortable?
- [ ] **Moving pieces.** Pick up a painting on its easel and a statue. Is the grab point (the middle of the piece) natural? Do they click into place within about a foot?
- [ ] **No copying.** With two players, confirm you cannot see the other player or their pieces.

## Map and Free Roam

- [ ] **Map button.** Press X on the left controller: the map appears in front of you; press X again to close it. Is it readable at that distance? Does it block anything awkwardly?
- [ ] **Floors.** Go up the Grand Staircase and open the map: is the upper floor highlighted, and does the arrow face the way you face?
- [ ] **How-to cards.** In VR the card arrives as a few announcements: are they readable before the round gets going?
- [ ] **Free Roam.** Walk every gallery; does the room counter reach 34? The host can end it from the menu.

## Elevators, climbing, guards (feedback round)

- [ ] **Elevator buttons.** Push a floor button with a fingertip; push the call button outside on the other floor. Do two players inside ride together?
- [ ] **Climbing.** Grip a wall or a banister with an empty hand and pull down: do you rise? Reach the top of a gallery partition and pull up onto it. Comfortable?
- [ ] **Jumping.** Press A: is a 0.65 m hop enough to get onto benches and the desk?
- [ ] **Guards.** Are the vision cones on the floor readable from standing height? Can you sneak behind a guard and smash something without being chased?
- [ ] **Breaking the museum.** Slash a painting upstairs (the price tag is by the frame) and knock over a knight with the sledgehammer.

## Faster walk and run

- [ ] **Walk 4.2 m/s.** Is smooth walking comfortable with the vignette?
- [ ] **Run 12.6 m/s.** Click the stick to run down the Great Hall. Any nausea? Do you stop cleanly at walls and rails?
