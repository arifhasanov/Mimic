# MIMIC — ship map artwork prompts

The map is background art for a TV screen. Player avatars, room labels, fuse badges and output numbers are drawn on top by the app. So the art must leave the middle of each room empty and must contain no readable text.

---

## Main prompt

> A top-down cutaway floor plan of a small cargo spaceship, drawn in a warm 2D animated style — clean bold outlines, flat colour blocks with soft cel shading, the look of a hand-painted animated feature rather than a technical blueprint. The ship flies left to right: engine nozzles at the far left, the nose and cockpit viewport at the far right. Five distinct rooms arranged in a wide horizontal layout on a 16:9 canvas. Top row, left to right: a reactor chamber with a glowing amber cylindrical core and heavy cooling ribs; a cargo hold with stacked crates and netting; a cockpit at the bow with two pilot seats and a curved forward viewport. Bottom row, left to right: a life support bay with tall green oxygen scrubber tanks and bundled air ducts; a wide medical bay with an examination table, a large ring-shaped scanner arch and hanging surgical lamps, reaching under the cockpit. Thick industrial pipes and cable conduits run visibly between neighbouring rooms along the walls, connecting reactor to cargo, cargo to cockpit, cockpit to med bay, med bay to life support, life support back to reactor, and one long pipe running diagonally from the reactor down into the med bay. The floor of every room is a plain uncluttered metal deck, with all machinery and detail pushed to the walls and corners, leaving the centre of each room completely open and empty. Muted retro-industrial palette of dusty teal, warm grey, rust orange and pale bone white, low contrast, gently lit as if from soft overhead panels. Slight lived-in wear: scuffs, floor markings, a few loose cables. Empty ship, no people, no characters, no writing, no letters, no numbers, no labels, no signage. Deep space visible around the hull edges.

**Settings:** 16:9, highest resolution available.

---

## Negative prompt

> text, letters, words, numbers, labels, signage, logos, watermark, UI elements, people, characters, astronauts, crowded floor, clutter in the middle of rooms, isometric 3D, photorealistic, dark and gloomy, harsh neon, lens flare, heavy shadows, busy patterns

---

## Style variants

Try each and pick what reads best from across a room.

**Flat vector.** Replace the style sentence with:
> Flat vector illustration, thick uniform outlines, limited palette of six colours, no gradients, no texture, poster-like and extremely legible from a distance.

**Storybook painterly.** Replace with:
> Soft painterly digital illustration with visible brush texture and warm ambient light, in the style of a children's book cross-section of a machine, cosy rather than menacing.

**Retro sci-fi cartoon.** Replace with:
> 1970s retro-futurist cartoon styling, chunky rounded machinery, cream and burnt orange palette, thick ink outlines, gentle halftone texture.

---

## If the model cannot keep the room layout

Generate the five rooms as separate square tiles and let the app compose them. Prompt per room, same style sentence each time:

- **Steering:** `A top-down cutaway of a spaceship cockpit, two pilot seats and a curved forward viewport, control consoles along the front wall, open empty floor in the centre.`
- **Reactor:** `A top-down cutaway of a spaceship reactor room, a glowing amber cylindrical core against the back wall, heavy cooling ribs and pipe manifolds, open empty floor in the centre.`
- **Cargo bay:** `A top-down cutaway of a spaceship cargo hold, stacked crates and cargo netting along the walls, a loading ramp, open empty floor in the centre.`
- **Oxygen:** `A top-down cutaway of a spaceship life support bay, tall green oxygen scrubber tanks along the walls, bundled air ducts, open empty floor in the centre.`
- **Med bay:** `A top-down cutaway of a spaceship medical bay, an examination table pushed to one side, a large ring-shaped body scanner arch, hanging surgical lamps, open empty floor in the centre.`

Then draw the pipes between tiles in code as simple lines. This is more reliable than asking one image to get the whole topology right, and it makes the map easier to re-theme later.

---

## Extra assets worth generating in the same style

- **Broken room overlay:** `A semi-transparent warning overlay for a damaged spaceship room, orange hazard stripes around the edges, sparks and a thin wisp of smoke, flat animated style, transparent background.`
- **X-ray scanner reveal:** `A dramatic front-facing illustration of a ring-shaped medical body scanner powering up, warm light spilling from the ring, empty scanner, flat animated style, no people.`
- **Alien silhouette for the reveal screen:** `A stylised silhouette of a humanoid figure whose skeleton is wrong — too many joints, elongated ribs — seen as a pale x-ray glow on a dark background, flat animated style, unsettling but not gory.`
- **Player avatar frames:** `A set of simple circular badge frames for a spaceship crew roster, riveted metal rings, flat animated style, transparent centres, no faces, no text.`

---

## Practical notes

Image models garble text almost every time, so ask for none and let the app render every label. Keep the art low in contrast — the avatars, fuse badges and numbers drawn on top need to stay readable against it. Ask for the empty floor centres explicitly in every prompt; it is the single instruction most likely to get dropped, and it is the one the app actually depends on.
