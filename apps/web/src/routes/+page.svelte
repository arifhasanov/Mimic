<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Starfield from '$lib/components/Starfield.svelte';
  import IntroductionComic from '$lib/components/IntroductionComic.svelte';
  import { hasSeenIntroduction, rememberIntroduction } from '$lib/introduction';
  import { game } from '$lib/game.svelte';
  import { emitAck, saveHost, saveSession } from '$lib/socket';

  const NOTICES: Record<string, string> = {
    closed: 'The host ended the game.',
    kicked: 'The host removed you from the room. You can join again.',
  };
  const notice = $derived(NOTICES[page.url.searchParams.get('notice') ?? ''] ?? '');

  // Whatever game this tab was in before, it is over now.
  let showIntroduction = $state(true);
  let menuHeading = $state<HTMLHeadingElement>();
  onMount(() => {
    game.reset();
    showIntroduction = !notice && !hasSeenIntroduction();
  });

  async function finishIntroduction() {
    rememberIntroduction();
    showIntroduction = false;
    await tick();
    menuHeading?.focus();
  }

  let code = $state('');
  let name = $state('');
  let error = $state('');
  let busy = $state(false);

  async function join(e: Event) {
    e.preventDefault();
    if (busy) return;
    error = '';
    const c = code.trim().toUpperCase();
    const n = name.trim();
    if (c.length !== 4) return (error = 'The room code is 4 letters.');
    if (!n) return (error = 'Enter your name.');

    busy = true;
    const res = await emitAck<{ ok: boolean; error?: string; token?: string; playerId?: string }>('join', {
      code: c,
      name: n,
    });
    busy = false;
    if (!res.ok) return (error = res.error ?? 'Could not join.');
    saveSession({ code: c, token: res.token!, playerId: res.playerId, name: n });
    goto('/play');
  }

  async function hostGame() {
    if (busy) return;
    busy = true;
    error = '';
    const res = await emitAck<{ ok: boolean; error?: string; code?: string; hostToken?: string }>(
      'hostCreate',
      {},
    );
    busy = false;
    if (!res.ok || !res.code) return (error = res.error ?? 'Could not create a game.');
    saveHost(res.code, res.hostToken!);
    goto('/host/' + res.code);
  }
</script>

<Starfield density={0.8} />

{#if showIntroduction}
  <IntroductionComic oncomplete={finishIntroduction} />
{:else}
<main>
  <header>
    <h1 class="cond" bind:this={menuHeading!} tabindex="-1">MIMIC</h1>
    <p class="tag">Something on this ship is wearing a face that isn't its own.</p>
  </header>

  {#if notice}<p class="notice">{notice}</p>{/if}

  <form onsubmit={join}>
    <label>
      <span class="eyebrow">Room code</span>
      <input
        class="mono code"
        bind:value={code}
        maxlength="4"
        autocapitalize="characters"
        autocomplete="off"
        spellcheck="false"
        placeholder="ABCD"
        oninput={() => (code = code.toUpperCase().replace(/[^A-Z]/g, ''))}
      />
    </label>

    <label>
      <span class="eyebrow">Your name</span>
      <input bind:value={name} maxlength="12" autocomplete="off" placeholder="Ann" />
    </label>

    {#if error}<p class="error">{error}</p>{/if}

    <button class="primary" type="submit" disabled={busy}>JOIN</button>
  </form>

  <div class="host">
    <p>Running the game on a monitor?</p>
    <button class="ghost" onclick={hostGame} disabled={busy}>Create a game</button>
  </div>
  <button class="replay" onclick={() => { showIntroduction = true; }}>Replay introduction</button>
</main>
{/if}

<style>
  main {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    max-width: 26rem;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 3rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2rem;
  }

  header {
    text-align: center;
  }

  h1 {
    margin: 0;
    font-size: 4.5rem;
    line-height: 0.9;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-indent: 0.14em;
    color: var(--ink);
    text-shadow: 0 0 40px rgba(95, 208, 196, 0.25);
  }

  .tag {
    margin: 0.9rem 0 0;
    color: var(--ink-faint);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  input {
    font: inherit;
    font-size: 1.15rem;
    padding: 0.85rem 1rem;
    background: var(--hull);
    border: 1px solid var(--line);
    border-radius: 12px;
    color: var(--ink);
    outline: none;
  }

  input:focus {
    border-color: var(--line-2);
  }

  .code {
    font-size: 2rem;
    letter-spacing: 0.45em;
    text-align: center;
    text-indent: 0.45em;
  }

  .primary {
    margin-top: 0.5rem;
    padding: 1.05rem;
    background: var(--hull-2);
    border: 1px solid var(--line-2);
    border-radius: 12px;
    font-size: 1.05rem;
    font-weight: 600;
    letter-spacing: 0.22em;
    text-indent: 0.22em;
  }

  .primary:disabled {
    opacity: 0.5;
  }

  .error {
    margin: 0;
    color: var(--danger);
    font-size: 0.88rem;
  }

  .notice {
    margin: 0;
    padding: 0.7rem 0.9rem;
    border: 1px solid var(--line-2);
    border-radius: 10px;
    background: var(--hull);
    color: var(--ink-dim);
    font-size: 0.9rem;
    text-align: center;
  }

  .host {
    text-align: center;
    border-top: 1px solid var(--line);
    padding-top: 1.5rem;
  }

  .host p {
    margin: 0 0 0.75rem;
    color: var(--ink-faint);
    font-size: 0.85rem;
  }

  .ghost {
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.6rem 1.2rem;
    color: var(--ink-dim);
    font-size: 0.9rem;
  }

  .replay { align-self: center; border: 0; background: transparent; color: var(--ink-dim); font-size: .8rem; text-decoration: underline; text-underline-offset: 4px; padding: .5rem; }
  h1:focus { outline: none; }
</style>
