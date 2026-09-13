# Introduction audio

Original files remain untouched in `../audio/`. The numbered narration files are mapped to pages in order and copied into `../apps/web/static/introduction-comic/audio/` with stable page IDs. No runtime audio-generation service is needed. All eight originals decoded without errors in FFmpeg.

| Page | Original | Runtime filename | Recording length | Page duration |
| --- | --- | --- | --- | --- |
| 1 — The haul | Track 1.mp3 | 01-the-haul.mp3 | 10.824 s | 14 s |
| 2 — Behind the stones | Track 2.mp3 | 02-behind-the-stones.mp3 | 8.760 s | 14 s |
| 3 — Borrowed faces | Track 3.mp3 | 03-borrowed-faces.mp3 | 10.248 s | 14 s |
| 4 — Ten aboard | Track 4.mp3 | 04-ten-aboard.mp3 | 10.632 s | 14 s |
| 5 — Something wrong | Track 5.mp3 | 05-something-wrong.mp3 | 12.096 s | 14 s |
| 6 — Proof of humanity | Track 6.mp3 | 06-proof-of-humanity.mp3 | 10.872 s | 14 s |
| 7 — Sabotage | Track 7.mp3 | 07-sabotage.mp3 | 12.672 s | 14 s |
| 8 — MIMIC | No narration | Music only | — | 14 s |
| Score | music.mp3 | music.mp3 | 100.040 s | Loops as needed |

Narration: mono, 24 kHz, 48 kbps MP3; measured mean levels -20.7 to -20.8 dBFS, peaks -3.7 to -4.9 dBFS. Music: stereo, 48 kHz, 128 kbps MP3; mean -15.6 dBFS, peak -0.4 dBFS. These are decoder and level checks, not a transcription or a subjective listening review. File numbering determines the page mapping.

Defaults: narration volume 90%, music slider 20%, with a further 35% reduction beneath narration. Music fades in, fades down/up around its loop boundary, and fades out over the final three seconds. Original file gain, duration, pitch and playback speed are preserved.

Play with sound and Play silently are explicit start choices. Pause and hidden-tab handling stop both streams at their current positions. Next, Previous, or a page button resets the narration for that page and seeks music to its timeline position. Turning sound back on midway joins the current position. Skip, completion, and component teardown pause both audio elements, including outstanding asynchronous playback requests. A missing audio file leaves the captions usable; blocked playback offers a Play retry or the sound-off control.
