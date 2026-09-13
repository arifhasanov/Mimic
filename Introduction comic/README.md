# Introduction comic

Seven narrated comic pages, then a MIMIC title card with music and the existing main menu. Every page stays for **14 seconds**, including the title: **112 seconds** total, excluding user pauses or buffering. The user supplied seven narration clips and background music in `../audio/`.

All seven illustrations are included. The boarding panel was corrected and visually checked for ten crew members. The title is rendered by the game so its lettering remains crisp at every screen size.

## Files

- `Narration.txt`: clean, page-by-page recording script for a separate voice-over app.
- `Narration.md`: the same script with scene directions and provisional timings.
- `slides.json`: canonical captions, image descriptions, page order, and durations consumed by the game.
- `artwork/`: full-resolution original PNG pages generated with the built-in imagegen tool.
- `Artwork prompts.md`: shared design direction and the final page prompts.
- `prepare.mjs`: optional utility to regenerate runtime WebP copies, copy the original MP3s, and update the narration handoff; requires the Node package `sharp`, or its installation path as the first argument.
- `Audio.md`: source-file mapping, measured clip lengths, and playback behavior.

## In the game

Open the home route `/` in a fresh browser tab session. The introduction appears before the menu. Completing or skipping it remembers that choice for this tab session; returning from a game goes straight to the menu. A `Replay introduction` button on the menu restarts it. Existing `/host/:code` and `/play` routes open directly.

Choose **Play with sound** or **Play silently** to begin. A user gesture starts audio reliably without relying on browser autoplay. Skip intro or Escape opens the menu immediately and stops both tracks. Left/Right arrows move between pages; when a volume slider is focused, they adjust its volume instead. Space toggles pause when a button or slider is not focused. Back, Next, Play/Pause, and individual page controls work with mouse, touch, or keyboard. Re-selecting the current page restarts it. Narration and music have separate volume sliders plus a sound toggle. Hidden tabs pause the clock and both tracks. Reduced-motion preference removes page animation. The title leads to the menu. Page timers wait for the illustration to load; failed images retain the story captions and skip controls.

The Svelte player is `../apps/web/src/lib/components/IntroductionComic.svelte`. Web assets are checked in under `../apps/web/static/introduction-comic/`; deployment needs no image-generation service or conversion step. The main menu integration is `../apps/web/src/routes/+page.svelte`.

## Art and story continuity

`../Spaceship.png` is a roof-removed plan, used only for approximate design. Exterior panels show a closed cream hull, rounded teal-glass cockpit, offset medbay side section, and four rear engines: three large, one smaller. The medbay uses an upright oval scanner ring and teal examination bed.

Ten miners land. Two are killed and copied. Eight original crew and two mimics board, while the two victims stay behind. Alien entry and copying are shown as non-graphic supernatural transformations; the copies reproduce the victims' bodies and clothing. The scanner is fully repaired before an unseen mimic sabotages it in the empty medbay.

The narration starts at the beginning of each illustrated page and ends naturally, leaving the remaining part of its 14 seconds for reading. Buffering pauses narrative progress rather than discarding speech. The music stays quiet under speech, rises slightly between lines, fades at the loop boundary, and fades out over the last three seconds of the title. It loops because the supplied music is 100 seconds and the complete intro is 112 seconds. Manual page jumps seek the music to the corresponding point. Returning to the menu stops all intro audio.
