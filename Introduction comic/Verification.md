# Introduction verification

## Audio update — 13 September 2026

All eight user-supplied MP3s decode without errors. SHA-256 checks confirm that every original matches both its static runtime copy and production-build copy. Track 1–7 map to comic pages 1–7; music.mp3 is the continuous score. All eight pages, including the title, are now 14 seconds each (112 seconds total). Source recordings are unchanged.

The updated web suite passes **45 tests**, including 12 comic-player tests. Audio coverage includes no autoplay before the start choice, narration-clock buffering, preserving the remainder of a 14-second page after speech, pause/resume, stopping on skip, late play-promise resolution after skip, blocked-playback recovery, missing-narration fallback, independent slider keyboard handling, restarting the current page, and pausing both streams while hidden. The existing session-storage tests also pass.

Svelte check: zero errors, one pre-existing unused `.sub.quiet` CSS warning. Production web build passes. Browser checks confirmed both MP3 streams loaded with their expected durations, advanced through the narrated pages, paused at their exact current positions and resumed. The source and deployment assets match byte-for-byte.

See `Audio.md` for measurements and source mapping. Checks validate decoding, levels, assets, and playback behavior; they do not claim a word-for-word transcription or a subjective listening review.

## Initial silent-version verification

Verified locally on 13 September 2026 in the Codex in-app Chromium browser. Tested the Svelte development app at `http://127.0.0.1:5173` and the built production app served by the existing Node server at `http://127.0.0.1:3000`.

## Results

- Fresh tab opens the comic before the main menu.
- Automatic playback advances through the story and returns to the main menu; nominal duration is 94.5 seconds plus any image-loading time.
- The MIMIC title card renders before the menu and supports its timed exit.
- Skip immediately opens the menu and moves keyboard focus to the MIMIC menu heading.
- Reloading after completion/skip keeps the menu open within the same tab session.
- Replay starts again on page 1.
- Previous/Next, individual page selection, pause/resume, and arrow-key navigation work.
- Phone portrait (390 × 844), compact landscape (844 × 390), and desktop (1280 × 720) were inspected. No horizontal overflow. Skip and transport controls stay within the visible compact landscape viewport after the sticky-control fix; the page can scroll vertically.
- A real missing-image case retained captions and controls. All seven final images now exist in both static source assets and production output. The sabotage image was checked as successfully decoded in the production browser.
- After skipping, Create a game opened a host lobby. A second browser tab skipped its intro and joined as TestMiner. The host showed that player. Closing this temporary room returned the player to the menu with the normal closed-room notice, without replaying the intro.
- Production browser error log was empty after complete automatic playback.

## Automated checks

`pnpm test`: 116 passing tests — 40 engine, 39 server, 37 web. Includes the real-socket gateway suite and seven new introduction tests for image-loading timing, pause/resume, keyboard navigation, title completion, skip, reduced motion, hidden tabs, session persistence, and blocked storage.

`pnpm --filter @mimic/web check`: zero errors. One existing unused-CSS warning remains for `.sub.quiet` in the phone route.

`pnpm --filter @mimic/web build`: passed. All seven WebP illustrations are in the static build. Artwork is roughly 3.3 MB combined; full-resolution PNG originals are kept separately.

`git diff --check`: passed.

## Fixes made during verification

- Completed and installed all seven illustrations; corrected page 4 to ten boarding miners while preserving the two victims in the lower panel.
- Made the top and bottom controls sticky so short landscape screens retain the skip and playback controls while scrolling.
- Fixed an existing TypeScript narrowing error in VotePanel by capturing the vote result before the player lookup callback. Runtime voting behavior is unchanged; its six existing tests passed.

Reduced-motion, hidden-tab timing, and blocked-storage behavior were exercised by component tests. Responsive tests emulate viewport sizes; no physical mobile device was used. Voice-over is a script handoff only and was not audio-tested.
