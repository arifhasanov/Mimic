<script lang="ts">
  import { onMount } from 'svelte';
  import { introductionSlides as slides, introductionImage, introductionNarration, introductionMusic } from '$lib/introduction';

  let { oncomplete }: { oncomplete: () => void } = $props();
  let index = $state(0);
  let paused = $state(false);
  let hidden = $state(false);
  let elapsed = $state(0);
  let imageReady = $state(false);
  let imageFailed = $state(false);
  let started = $state(false);
  let sound = $state(false);
  let voiceEnded = $state(false);
  let voiceFailed = $state(false);
  let musicFailed = $state(false);
  let audioNotice = $state('');
  let narrationVolume = $state(0.9);
  let musicVolume = $state(0.2);
  let voice = $state<HTMLAudioElement>();
  let music = $state<HTMLAudioElement>();
  let mediaVersion = 0;
  const pendingPlay = new Map<HTMLAudioElement, number>();
  let finished = false;
  let container: HTMLElement;
  const slide = $derived(slides[index]);
  const isTitle = $derived(index === slides.length - 1);
  const progress = $derived(Math.min(100, (elapsed / slide.durationMs) * 100));

  function complete() {
    if (finished) return;
    finished = true;
    mediaVersion++;
    voice?.pause();
    music?.pause();
    oncomplete();
  }

  function goTo(next: number, manual = true) {
    if (next >= slides.length) return complete();
    if (next < 0) return;
    const samePage = next === index;
    mediaVersion++;
    voice?.pause();
    index = next;
    elapsed = 0;
    imageReady = next === slides.length - 1 || (samePage && imageReady);
    imageFailed = samePage && imageFailed;
    voiceEnded = false;
    voiceFailed = false;
    audioNotice = '';
    if (voice) {
      voice.currentTime = 0;
      if (next < slides.length - 1) voice.src = introductionNarration(slides[next].id);
      else voice.removeAttribute('src');
    }
    // Manual jumps move the music to the corresponding point; normal playback is continuous.
    if (manual && music && Number.isFinite(music.duration) && music.duration > 0) {
      music.currentTime = slides.slice(0, next).reduce((sum, page) => sum + page.durationMs, 0) / 1000 % music.duration;
    }
    syncMedia();
  }

  function canPlay() {
    return started && sound && !paused && !hidden && !finished && (imageReady || imageFailed);
  }

  function requestPlay(media: HTMLAudioElement, kind: 'voice' | 'music') {
    if (!media.paused || pendingPlay.get(media) === mediaVersion) return;
    const version = mediaVersion;
    pendingPlay.set(media, version);
    void media.play().then(() => {
      // A delayed play request must never restart audio after Skip, pause, or unmount.
      if (!canPlay()) media.pause();
    }).catch((error: unknown) => {
      if (version !== mediaVersion || !canPlay()) return;
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        paused = true;
        audioNotice = 'Your browser paused the sound. Press Play to continue, or turn sound off.';
      } else if (!(error instanceof DOMException && error.name === 'AbortError')) {
        if (kind === 'voice') voiceFailed = true;
        else musicFailed = true;
        audioNotice = kind === 'voice' ? 'Narration unavailable on this page. The captions will continue.' : 'Music unavailable. Narration will continue.';
      }
    }).finally(() => {
      if (pendingPlay.get(media) === version) pendingPlay.delete(media);
      // A rapid pause/resume can abort an older play promise after the new intent arrives.
      if (canPlay() && media.paused && (kind === 'voice' ? !voiceEnded && !voiceFailed && !isTitle : !musicFailed)) {
        requestPlay(media, kind);
      }
    });
  }

  function syncMedia() {
    if (!voice || !music) return;
    if (canPlay()) {
      if (!isTitle && !voiceEnded && !voiceFailed) requestPlay(voice, 'voice');
      if (!musicFailed) requestPlay(music, 'music');
    } else {
      voice.pause();
      music.pause();
    }
  }

  function start(withSound: boolean) {
    sound = withSound;
    started = true;
    paused = false;
    syncMedia();
  }

  function togglePause() {
    if (!started) return start(true);
    paused = !paused;
    syncMedia();
  }

  function toggleSound() {
    sound = !sound;
    if (sound && voice && !isTitle) {
      // Enabling sound midway joins the current caption instead of repeating its beginning.
      voiceEnded = Number.isFinite(voice.duration) && elapsed / 1000 >= voice.duration;
      voice.currentTime = Math.min(elapsed / 1000, Number.isFinite(voice.duration) ? voice.duration : elapsed / 1000);
    }
    if (sound && music && Number.isFinite(music.duration) && music.duration > 0) {
      music.currentTime = (slides.slice(0, index).reduce((sum, page) => sum + page.durationMs, 0) + elapsed) / 1000 % music.duration;
    }
    syncMedia();
  }

  function fadeMusic(delta: number) {
    if (!music) return;
    const cycle = Math.min(1, music.currentTime / 1.2, Number.isFinite(music.duration) ? Math.max(0, (music.duration - music.currentTime) / 1.2) : 1);
    const ending = isTitle ? Math.min(1, Math.max(0, (slide.durationMs - elapsed) / 3000)) : 1;
    const duck = !isTitle && !voiceEnded && !voiceFailed ? 0.65 : 1;
    const target = musicVolume * cycle * ending * duck;
    music.volume += (target - music.volume) * Math.min(1, delta / 350);
  }

  function onKey(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      complete();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(index - 1);
    } else if (event.code === 'Space' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      togglePause();
    }
  }

  onMount(() => {
    container.focus();
    paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (voice) voice.src = introductionNarration(slide.id);
    if (music) music.volume = 0;
    const visibility = () => { hidden = document.hidden; };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = Math.min(now - last, 250);
      last = now;
      if (started && !finished && !paused && !hidden && (imageReady || imageFailed)) {
        if (sound && !isTitle && !voiceFailed && !voiceEnded && voice) {
          // The audio clock holds the page during buffering, and cannot cut a spoken line short.
          elapsed = Math.max(elapsed, voice.currentTime * 1000);
        } else {
          elapsed += delta;
        }
        if (sound) fadeMusic(delta);
        if (elapsed >= slide.durationMs && (!sound || isTitle || voiceEnded || voiceFailed)) goTo(index + 1, false);
      }
    }, 100);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
      finished = true;
      mediaVersion++;
      voice?.pause();
      music?.pause();
    };
  });

  $effect(() => { syncMedia(); });
  $effect(() => { if (voice) voice.volume = narrationVolume; });

  // Start fetching the next page while the current one is being read.
  $effect(() => {
    const next = slides[index + 1];
    if (next && next.id !== '08-title') {
      const preload = new Image();
      preload.src = introductionImage(next.id);
    }
  });
</script>

<svelte:window onkeydown={onKey} />

<audio
  bind:this={voice}
  aria-label="Narration audio"
  preload="auto"
  onended={() => {
    if (voice) elapsed = Math.max(elapsed, voice.currentTime * 1000);
    voiceEnded = true;
  }}
  onerror={() => {
    if (!isTitle) {
      voiceFailed = true;
      audioNotice = 'Narration unavailable on this page. The captions will continue.';
    }
  }}
></audio>
<audio
  bind:this={music}
  aria-label="Background music audio"
  src={introductionMusic}
  preload="auto"
  loop
  onerror={() => { musicFailed = true; audioNotice = 'Music unavailable. Narration will continue.'; }}
></audio>

<section class="comic" bind:this={container!} tabindex="-1" aria-label="MIMIC introduction">
  <header class="topbar">
    <span class="brand cond">MIMIC <span>/ PROLOGUE</span></span>
    <button class="skip" onclick={complete}>Skip intro <span aria-hidden="true">↗</span></button>
  </header>

  <div class="soundbar">
    {#if !started}
      <span class="sound-invitation">A story from the dark.</span>
      <button class="sound-start" onclick={() => start(true)}>Play with sound</button>
      <button onclick={() => start(false)}>Play silently</button>
    {:else}
      <button class="sound-toggle" aria-pressed={sound} onclick={toggleSound}>{sound ? 'Sound on' : 'Sound off'}</button>
      <label>Narration <input type="range" min="0" max="1" step="0.05" bind:value={narrationVolume} disabled={!sound} /></label>
      <label>Music <input type="range" min="0" max="1" step="0.05" bind:value={musicVolume} disabled={!sound} /></label>
    {/if}
    {#if audioNotice}<p class="audio-notice" role="status">{audioNotice}</p>{/if}
  </div>

  <div class="stage">
    {#key index}
      <article class:title-card={isTitle} class="page">
        {#if isTitle}
          <div class="title-art">
            <div class="title-rule"></div>
            <h1 class="cond">MIMIC</h1>
            <p>Something on this ship is wearing a face that isn't its own.</p>
            <div class="title-rule"></div>
          </div>
        {:else}
          <div class="artwork">
            <img
              src={introductionImage(slide.id)}
              alt={slide.alt}
              onload={() => { imageReady = true; }}
              onerror={() => { imageFailed = true; }}
            />
            {#if imageFailed}<p class="image-status">Illustration unavailable. The story continues below.</p>{/if}
          </div>
          <div class="caption" aria-live="polite" aria-atomic="true">
            <div class="chapter">
              <span class="chapter-number mono">{String(index + 1).padStart(2, '0')}</span>
              <div><p class="location mono">{slide.location}</p><h2 class="cond">{slide.title}</h2></div>
            </div>
            <p class="narration">{slide.narration}</p>
          </div>
        {/if}
      </article>
    {/key}
  </div>

  <footer class="controls">
    <div class="transport">
      <button aria-label="Previous page" disabled={index === 0} onclick={() => goTo(index - 1)}>←</button>
      <button class="pause" aria-label={!started || paused ? 'Play introduction' : 'Pause introduction'} onclick={togglePause}>
        {!started || paused ? 'Play' : 'Pause'}
      </button>
      <button aria-label={isTitle ? 'Open main menu' : 'Next page'} onclick={() => goTo(index + 1)}>{isTitle ? 'Main menu →' : 'Next →'}</button>
    </div>
    <div class="pagination" aria-label="Comic pages">
      {#each slides as item, i}
        <button class:active={i === index} class:read={i < index} aria-label={`Page ${i + 1}: ${item.title}`} aria-current={i === index ? 'step' : undefined} onclick={() => goTo(i)}>
          <span style:width={i < index ? '100%' : i === index ? `${progress}%` : '0%'}></span>
        </button>
      {/each}
    </div>
    <span class="counter mono">{String(index + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</span>
  </footer>
</section>

<style>
  .comic { position: relative; z-index: 2; min-height: 100dvh; display: flex; flex-direction: column; background: #070a0fe8; outline: none; }
  .topbar, .controls { width: min(1440px, 100%); margin: 0 auto; display: flex; align-items: center; }
  .topbar { position: sticky; top: 0; z-index: 3; background: #070a0ff5; justify-content: space-between; padding: 1rem clamp(1rem, 3vw, 3rem); gap: 1rem; }
  .brand { font-weight: 700; font-size: 1.2rem; letter-spacing: .2em; }
  .brand span { font-family: 'IBM Plex Mono', monospace; font-size: .62rem; font-weight: 400; letter-spacing: .14em; color: #8b969f; margin-left: .7rem; }
  button { border: 1px solid #39434b; background: #111820; border-radius: 3px; padding: .65rem .95rem; font-size: .8rem; min-height: 42px; }
  button:hover:not(:disabled) { border-color: #b6c9c8; background: #1d2a31; }
  button:focus-visible { outline: 2px solid var(--teal); outline-offset: 4px; }
  button:disabled { opacity: .3; }
  .skip { background: transparent; border-color: transparent; color: #ced5d8; }
  .skip span { color: var(--teal); margin-left: .7rem; }
  .soundbar { width: min(1320px, 100%); margin: 0 auto; padding: 0 clamp(1rem, 3vw, 3rem) .7rem; display: flex; align-items: center; justify-content: center; gap: .7rem 1.2rem; flex-wrap: wrap; }
  .sound-invitation { color: #a5b1b8; font-size: .85rem; }
  .sound-start { border-color: #87aca6; color: #c6efe8; }
  .soundbar label { display: flex; align-items: center; gap: .6rem; color: #a5b1b8; font-size: .72rem; }
  .soundbar input { width: clamp(65px, 10vw, 130px); accent-color: #a7c7be; cursor: pointer; }
  .soundbar input:focus-visible { outline: 2px solid var(--teal); outline-offset: 4px; }
  .audio-notice { flex-basis: 100%; text-align: center; margin: 0; font-size: .75rem; color: #e2c58c; }
  .stage { width: min(1320px, 100%); padding: .25rem clamp(1rem, 3vw, 3rem); margin: auto; }
  .page { animation: arrive 500ms ease-out both; border: 1px solid #495052; box-shadow: 0 12px 60px #0008; background: #11171c; }
  .artwork { position: relative; width: 100%; background: #10151b; aspect-ratio: 16 / 9; max-height: 53dvh; }
  .artwork img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .image-status { position: absolute; inset: 40% 1rem auto; text-align: center; color: #c7d0d3; }
  .caption { padding: 1.2rem 1.5rem 1.35rem; display: grid; grid-template-columns: minmax(190px, .8fr) 2fr; gap: 1.6rem; border-top: 3px solid #bfa779; background: #141b20; }
  .chapter { display: flex; gap: .9rem; align-items: center; }
  .chapter-number { font-size: 2.6rem; color: #bfa779; line-height: 1; }
  .location { color: #a5b1b8; margin: 0 0 .2rem; font-size: .6rem; letter-spacing: .12em; text-transform: uppercase; }
  h2 { font-size: 1.65rem; margin: 0; text-transform: uppercase; line-height: 1.1; }
  .narration { margin: 0; font-size: clamp(.9rem, 1.25vw, 1.1rem); line-height: 1.65; color: #e4e5df; align-self: center; }
  .controls { position: sticky; bottom: 0; z-index: 3; background: #070a0ff5; padding: 1.1rem clamp(1rem, 3vw, 3rem) 1.5rem; gap: 1.8rem; }
  .transport { display: flex; gap: .4rem; flex-shrink: 0; }
  .pause { min-width: 70px; }
  .pagination { display: flex; flex: 1; gap: .4rem; }
  .pagination button { min-width: 0; flex: 1; height: 32px; min-height: 32px; border: 0; padding: 13px 0; background: transparent; position: relative; }
  .pagination button::before { content: ''; position: absolute; left: 0; right: 0; top: 13px; height: 3px; background: #39434b; }
  .pagination span { display: block; position: relative; height: 3px; background: #829b98; }
  .pagination .active span { background: #e2c58c; }
  .pagination .active::before { background: #74664c; }
  .counter { color: #a4b0b8; font-size: .72rem; white-space: nowrap; }
  .title-card { border-color: transparent; background: radial-gradient(ellipse at center, #20353a70, transparent 65%); box-shadow: none; }
  .title-art { min-height: 59dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem 1rem; text-align: center; }
  h1 { font-size: clamp(5rem, 16vw, 13rem); letter-spacing: .2em; text-indent: .2em; margin: 1.5rem 0; line-height: 1; color: #e8e8df; text-shadow: 3px 0 #6ca7a17a, -3px 0 #b15e433f, 0 0 70px #5fd0c422; }
  .title-art p { max-width: 26rem; color: #acb8bf; font-size: .95rem; line-height: 1.6; margin: 0 0 2rem; }
  .title-rule { width: 3rem; height: 2px; background: #bfa779; }
  @keyframes arrive { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
  @media (max-width: 700px) {
    .caption { grid-template-columns: 1fr; gap: .85rem; padding: 1rem; }
    .chapter-number { font-size: 2rem; }
    h2 { font-size: 1.4rem; }
    .controls { flex-wrap: wrap; gap: .4rem 1rem; justify-content: space-between; }
    .pagination { order: 3; flex-basis: 100%; }
    .brand span { display: none; }
    .artwork { max-height: none; }
    .narration { font-size: .9rem; }
    .soundbar { gap: .5rem .7rem; }
    .sound-invitation { flex-basis: 100%; text-align: center; }
  }
  @media (prefers-reduced-motion: reduce) { .page { animation: none; } }
</style>
