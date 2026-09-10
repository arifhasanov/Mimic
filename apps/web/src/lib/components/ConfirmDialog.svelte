<script lang="ts">
  /**
   * A modal yes/no for the two host actions that end a game for everyone. Built in rather
   * than using window.confirm, which looks out of place on a monitor across the room and
   * blocks the page's own timers while it is open.
   */
  let {
    open,
    title,
    body,
    confirmLabel,
    onconfirm,
    oncancel,
  }: {
    open: boolean;
    title: string;
    body: string;
    confirmLabel: string;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  let cancelButton = $state<HTMLButtonElement | null>(null);

  // Focus lands on Cancel, so a stray Enter or Space never ends the game.
  $effect(() => {
    if (open) cancelButton?.focus();
  });

  function onKey(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if open}
  <div class="backdrop" role="presentation" onclick={oncancel}>
    <div
      class="dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <h3 id="confirm-title" class="cond">{title}</h3>
      <p id="confirm-body">{body}</p>
      <div class="buttons">
        <button class="cancel" bind:this={cancelButton} onclick={oncancel}>Cancel</button>
        <button class="confirm" onclick={onconfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    background: rgba(3, 5, 8, 0.72);
    backdrop-filter: blur(3px);
  }

  .dialog {
    width: min(32rem, calc(100vw - 2rem));
    padding: 1.6rem 1.75rem 1.4rem;
    background: var(--hull);
    border: 1px solid var(--line-2);
    border-radius: 16px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
  }

  h3 {
    margin: 0;
    font-size: 2rem;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  p {
    margin: 0.6rem 0 1.5rem;
    color: var(--ink-dim);
    font-size: 1.05rem;
    line-height: 1.5;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  button {
    padding: 0.7rem 1.4rem;
    border-radius: 10px;
    font-size: 1rem;
    font-weight: 600;
  }

  .cancel {
    background: transparent;
    border: 1px solid var(--line-2);
    color: var(--ink-dim);
  }

  .confirm {
    background: rgba(255, 107, 61, 0.12);
    border: 1px solid var(--danger);
    color: var(--danger);
  }

  button:focus-visible {
    outline: 2px solid var(--teal);
    outline-offset: 2px;
  }
</style>
