# BUBBLE KEEP

Twelfth game in the harsh-critic-loop series, after
[NEONOID](https://github.com/melvincarvalho/neonoid),
[NEON MINER](https://github.com/melvincarvalho/neonminer),
[NEODROID](https://github.com/melvincarvalho/neodroid),
[NEON DASH](https://github.com/melvincarvalho/neondash),
[NEONLINGS](https://github.com/melvincarvalho/neonlings),
[NEOPOLIS](https://github.com/melvincarvalho/neopolis),
[NEON SCORCH](https://github.com/melvincarvalho/neonscorch),
[NEON MASTER](https://github.com/melvincarvalho/neonmaster),
[NEON ELITE](https://github.com/melvincarvalho/neonelite),
[NEOCIV](https://github.com/melvincarvalho/neociv) and
[NEOTRIS](https://github.com/melvincarvalho/neotris) — and **the first
one to leave the wireframe behind.** Eleven games of neon; this one is
arcade: chunky lit stone, dragons with faces, iridescent glass, fruit,
and a CRT finish.

A Bubble Bobble tribute. Trap a monster in a bubble, then burst it
before it wriggles out — and burst four in one breath if you can, for
1000, 2000, 4000, 8000. Monsters that escape come back angry and half
again as fast. Ride a bubble upward. Fall out of the floor and drop in
from the ceiling. Collect E-X-T-E-N-D for another dragon. And if you
dawdle past forty-two seconds, something that cannot be bubbled comes
looking for you. Original dragons, rooms and monsters — Bubble Bobble
(Taito, 1986) is copyrighted, and revered here.

**Play it: <https://melvincarvalho.github.io/bubblekeep/>**

![BUBBLE KEEP — a monster caught](shots/trapped.png)

**There are no assets.** Every pixel and every sound is generated from
code. Two files: `index.html`, `game.js`. ←→ or A/D run, ↑/Z/W jump,
SPACE or X blows a bubble, P pauses, M mutes.

```bash
python3 -m http.server 8000   # or just open index.html
```

## The experiment

Same pipeline as the first eleven games — one owner builds,
deterministic `?shot=` captures, four harsh sub-agent critics (three
visual lenses plus a Bubble-Bobble-fidelity judge), honest scores. The
proof harness's next species: **rescues as theorems.**

`tools/playtest.sh` proves 24 claims:

- **the bot must empty the keep**: all six rooms cleared, 19 monsters
  bubbled and burst, two dragons lost along the way — and it plays
  through the *same input object the keyboard fills*, pressing left,
  right, jump and blow, never teleporting or scripting a kill;
- **and not only on one run of the dice**: across eight seeds the bot
  clears the keep at least six times, while the do-nothing dragon
  clears it zero times out of eight;
- **the ablations form a gradient, not a cliff** — which is the whole
  point of having them:

  | policy | rooms cleared |
  |---|---|
  | full policy | **6** |
  | no jumping | 2 |
  | bubbles but never bursts them | 1 |
  | never blows a bubble | 0 |
  | does nothing at all | 0 (dies) |

- **18 mechanism proofs** isolate every rule of the cave: a bubble
  coasts ~133px and then climbs; it catches a monster and carries it;
  bursting one pays 1000 and drops fruit; a bubble left too long bursts
  at 9.3 seconds and returns its captive **angry and 1.45× faster** (a
  measured speed, not a label); chains pay 1000/2000/4000/8000 and a
  late fourth pop pays only 1000 again; a dragon can stand on a bubble
  and ride it up; falling out of the floor drops you in from the
  ceiling; HURRY UP fires at 42 seconds and the ghost that follows
  closes on you **on both axes**; touching a monster kills but a
  bubbled one is harmless; six letters grant a life; fruit pays
  100/300/700/1500; the last monster opens the next room for 5000;
  stone blocks you from **both** sides but platforms can be jumped up
  through; a wanderer walks, a flyer homes, a hurler throws; a thrown
  boulder kills, falls and travels; monsters step off a shelf when the
  dragon is below but patrol when it is level; and a newborn bubble is
  not swallowed by the snout that blew it.

**And the proofs must prove they can fail.** `tools/mutate.sh` breaks
one rule of the cave at a time — 28 mutants: bubbles that catch
nothing, captives that never escape, anger that is only cosmetic, a
ghost that does not hunt, walls you can walk through, a hurler that
never throws, monsters that never leave their shelf — and requires a
**targeted mechanism proof** to turn red for each. A mutant killed only
by the 400-second bot run does not count; a long game diverges under
almost any change.

```
28/28 killed by a targeted mechanism proof
 0/28 killed only by a macro run (chaos)
 0/28 survived everything
```

## Scores

| round | composition | game-feel | HUD | visual mean | BB fidelity |
|---|---|---|---|---|---|
| 1 (final) | 5.2 | 5.6 | 4.3 | **5.0** | TBD |

Composition: *"clean, tidy, correctly-assembled — and completely
inert."* Game-feel: *"a well-organised game that does not yet have a
body."* HUD: *"a handsome, well-drawn cave that never once explains its
own central trick."*

A post-panel batch answered them. The HUD critic's sharpest catch was
that **the captured monster was invisible** — the bubble's own glass
was painted over it, so the object of the entire game read as "a second
colour of bubble." Bubbles are now drawn as glass *behind* the captive,
tinted to the monster's own hue, with a cage of light over the top, and
they rattle and swell as the escape approaches. The timer bar was
drawing **full** at the exact moment time ran out; it now drains to
empty and the panic moves to a pulsing border around the room. The end
cards had a ghost of their own headline behind them (a death banner
that outlived the death), no way to restart, and the grammar
"1 DRAGONS LOST" — all three fixed, and the losing and winning dragons
now stand in the frame, the winners hopping among rising bubbles. The
HUD was rebuilt in one grammar with the player's actual objective —
**MONSTERS LEFT IN THE ROOM** — filling the dead space, and EXTEND
labelled with what it grants. The title now teaches the half of the
verb it was missing: *trap a monster in a bubble, then jump into it to
pop it.*

The feel critic got a new jump: variable height, 100ms of coyote time,
a 120ms input buffer, and asymmetric gravity so the apex hangs and the
fall bites. Blowing a bubble now recoils the dragon, puffs four motes
from the snout and makes a noise. Trapping and popping stop the clock
for 50–140ms — hitstop, the cheapest drama in 2D — and throw an
expanding ring. Chain popups ladder upward with a scale-punch instead
of piling into an illegible heap. Platforms gained cast shadows,
rounded ends with squared interior joins so a run reads as one slab,
and per-tile studs and cracks.

All 24 theorems and the mutation gate re-verified after every change.
The scores above are the panel's, judged before those fixes.

## Honest assessment

- **One critic round** — the scores are a floor, not a ceiling.
- **Six rooms, not a hundred.** Three monster types, not a dozen. No
  water, fire or lightning bubbles; no treasure; no potions; no
  Skel-Monsta; no secret rooms; no true ending; no second player —
  the title says *two little dragons* and ships one.
- **28 mutants is not all mutants.** The gate proves the suite catches
  the twenty-eight rule-breaks it was pointed at.
- **Nothing exercises the input layer.** DAS-style repeat, the exact
  jump-buffer window and the mute toggle are proven by no test.
- Staged evidence shots are separate deterministic runs; any capture
  built from a hand-made room carries a `STAGED POSITION` watermark
  rather than passing as play.

## Process notes

1. **The bot found a level-design bug no playtester would have
   survived.** The very first solution run cleared nothing at all, and
   the telemetry said why: the dragon spawned directly above a hole in
   the floor of room 1, fell through, wrapped to the ceiling, and fell
   again — forever. Six rooms were rebuilt around the discovery.
2. **The dragon was eating its own breath.** After the spawn bug, the
   bot blew 137 bubbles and trapped nothing. A bubble is born at the
   snout — *inside the dragon's own hitbox* — so the pop-on-touch check
   destroyed it on the same frame it was created. A 0.3-second grace
   period turned a 0% hit rate into a 100% one, and `mech-selfbubble`
   now guards it.
3. **Then it overshot every monster.** Trapping still failed because
   the bot fired from wherever it stood, and a bubble coasts a fixed
   ~129px before it starts to climb. Teaching the bot to *stand at that
   distance* — and to check its line of fire, because a shelf eats the
   shot — was the difference between a bot that sprays and a bot that
   hunts.
4. **Fleeing was the wrong instinct.** The bot survived by running from
   anything that came close, which meant it never killed anything
   cornered. Replacing the panic response with *blow a bubble in its
   face, then step back* took it from 15 monsters to 21 in the same
   time.
5. **A feel fix broke the bot, and that was informative.** Adding
   variable jump height — release early, jump shorter — instantly
   crippled it, because the bot pressed jump for exactly one frame. It
   now holds the button while rising, like a player does. The physics
   change was right; the bot had been exploiting a jump that could not
   be shortened.
6. **The mutation gate caught what four green suites could not.** Its
   first honest run left five rules unguarded: the hurry-up ghost could
   stop hunting horizontally and `mech-hurry` still passed (it summed
   both axes, and vertical homing alone carried it); walls could stop
   blocking from one side; boulders could pass through you; monsters
   could refuse to leave their shelves; and a bubble could be swallowed
   at birth. Five new or tightened proofs later, 28/28.

## License

Copyright © 2026 Melvin Carvalho.

Licensed under the [GNU Affero General Public License v3.0 or later](LICENSE)
(AGPL-3.0-or-later).
