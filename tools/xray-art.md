# Medbay repair artwork

The built-in imagegen tool prepared both assets from the supplied source images.
The original `Spaceship.png` and `apps/web/static/ship-map.png` remain unchanged.
`XrayAssembly.svelte` clips the retouched background to the old scanner's footprint
and draws one assembly tile above it, below the room badges and occupants.
The floor-backed tiles have feathered edges; they do not require transparency.

Assets:

- `apps/web/static/ship-medbay-empty.png`: retouched ship, used only beneath the old scanner.
- `apps/web/static/xray-assembly.png`: six assembly tiles in a 3-by-2 grid.

Placement lives in `shipMap.config.ts`; progress mapping lives in `repairFrame.ts`.
The final tile is reserved for completed repairs. Sabotage selects an unfinished tile again.

## Powered scanner

`apps/web/static/xray-animation.png` is an unchanged copy of the supplied
`X-ray machine animation.png` (1983 x 793, ten frames in two rows).
When the scanner is online and fully repaired, and the shared power-cell pool meets
the configured scan cost, `XrayAssembly.svelte` loops the ring over two seconds.
Only the inner opening is sampled from each frame and masked over the assembled tile,
so the casing, table and floor remain stationary. The per-frame sample positions
account for uneven spacing in the source sheet. No new artwork was generated for this pulse.
Below the power threshold the overlay is removed, revealing the final assembly tile.
Reduced-motion mode uses a steady illuminated ring instead of a pulse.

## Final background prompt

Input: `Spaceship.png`.

Use case: precise-object-edit. Asset type: game ship map background. Edit the provided image: remove ONLY the X-ray scanner in the lower-right Medbay (white ring, turquoise patient table, and their floor bases, approximately x=900..1180 y=535..755 of the 1672x941 original). Reconstruct the plain warm grey Medbay floor behind them. Keep the ceiling surgical lights and back wall cabinets untouched. Preserve the exact full ship composition, dimensions, framing, all other rooms, machinery, walls, floor outlines, paint markings, and exterior transparent alpha. Do not change any detail outside that scanner footprint. Return the same full map with the Medbay's scanner removed, clean continuous floor. No new objects.

## Final assembly prompt

Inputs: `X-ray machine assembly.png` and the generated empty-Medbay map.

Use case: compositing. Asset type: six repair-stage tile sprite sheet for the Medbay of this spaceship game. Image 1 is the six-stage machine reference, keep every stage and component arrangement and 3-column 2-row order. Image 2 is reference for the Medbay FLOOR color, texture and overhead slightly isometric perspective. Create a 1536x1024 sheet of SIX square 512x512 tiles without any gutters or lines. In every tile place the corresponding stage from image 1 on a plain muted warm grey Medbay floor exactly matching the interior floor in the lower-right room of image 2 (approximately color #817d6e). Machine artwork should match the darker muted lighting and less saturated cream casing of the spaceship reference. No vignette, NO checkerboard, NO transparency, no color glow, no tile borders, no walls, no labels. Keep floor consistent uniform fine grain from corner to corner across all six tiles, same grey floor color at ALL tile edges. Every stage's machine and all loose parts and tools fit within the central 82% of its tile with at least 9% blank floor margin on every side. Keep stage order: completely disassembled parts, base assembled with loose components, exposed ring frame, mostly assembled ring with loose covers, near-complete scanner missing small cover, fully assembled closed scanner. All six use same camera angle and machine scale. This sheet is to be cropped into tiles and placed directly onto that ship room floor.
