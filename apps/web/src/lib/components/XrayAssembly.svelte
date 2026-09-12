<script lang="ts">
  import { repairFrame } from '$lib/repairFrame';
  import { shipMap } from '$lib/shipMap.config';

  let {
    progress, target, online = false, powerCells = 0, scanCost = 1,
  }: {
    progress: number; target: number; online?: boolean; powerCells?: number; scanCost?: number;
  } = $props();
  const frame = $derived(repairFrame(progress, target));
  const ready = $derived(online && progress >= target && powerCells >= scanCost);
  const art = shipMap.xray;
</script>

<!-- Only the old scanner's footprint uses the retouched map. Everything else keeps
     the original ship pixels, including its transparent exterior and engine nozzles. -->
<div class="floor" aria-hidden="true" style:background-image={`url(${art.floor})`}></div>
<div
  class="assembly"
  role="img"
  aria-label={`Medbay X-ray: ${progress} of ${target} repairs complete${ready ? ', ready to scan' : ''}`}
  data-frame={frame}
  data-ready={ready}
  style={`left: ${art.box.x}%; top: ${art.box.y}%; width: ${art.box.w}%; height: ${art.box.h}%; background-image: url(${art.image}); background-position: ${(frame % 3) * 50}% ${Math.floor(frame / 3) * 100}%`}
>
  {#if ready}
    <div class="ring" aria-hidden="true">
      <div class="pulse" style:background-image={`url(${art.animation})`}></div>
    </div>
  {/if}
</div>

<style>
  .floor,
  .assembly {
    position: absolute;
    pointer-events: none;
    background-repeat: no-repeat;
  }

  .floor {
    inset: 0;
    background-size: 100% 100%;
    clip-path: polygon(64% 56%, 71% 56%, 71% 81%, 53% 81%, 53% 66%, 64% 66%);
  }

  .assembly {
    background-size: 300% 200%;
    /* Blend the tiles' matching floor into the room, keeping all machine parts opaque. */
    mask-image: linear-gradient(to right, transparent, black 6%, black 94%, transparent),
      linear-gradient(to bottom, transparent, black 6%, black 94%, transparent);
    mask-composite: intersect;
  }

  .ring {
    position: absolute;
    left: 60%;
    top: 18%;
    width: 11%;
    height: 43%;
    overflow: hidden;
    mask-image: radial-gradient(ellipse 50% 50% at 50% 50%, black 88%, transparent 100%);
  }

  .pulse {
    position: absolute;
    inset: 0;
    /* Sample only the 37 x 176 px opening from the 1983 x 793 sheet.
       Per-frame positions compensate for the source's uneven cell spacing. */
    background-size: 5359.4595% 450.5682%;
    background-repeat: no-repeat;
    animation: scan-pulse 2s step-end infinite;
  }

  @keyframes scan-pulse {
    0% { background-position: 12.4872% 17.9903%; }
    10% { background-position: 31.9630% 17.9903%; }
    20% { background-position: 52.1069% 17.9903%; }
    30% { background-position: 71.7369% 17.9903%; }
    40% { background-position: 92.1891% 17.9903%; }
    50% { background-position: 12.4872% 77.6337%; }
    60% { background-position: 31.9630% 77.6337%; }
    70% { background-position: 52.1069% 77.6337%; }
    80% { background-position: 71.7369% 77.6337%; }
    90% { background-position: 92.1891% 77.6337%; }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse {
      animation: none;
      background-position: 92.1891% 17.9903%;
    }
  }
</style>
