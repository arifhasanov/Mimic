<script lang="ts">
  /**
   * The broken-room overlay from `mimic-v1-map-image-prompt.md`: a bold yellow/black
   * hazard-striped border drawn around the room, with a faint scorch wash and a slow
   * pulse so a broken room is unmistakable from three metres.
   *
   * Drawn as inline SVG rather than a bitmap so it scales to any room rectangle and can
   * be recoloured without re-generating art.
   */
  let {
    id,
    fuse = null,
    thickness = 10,
    radius = 14,
  }: { id: string; fuse?: number | null; thickness?: number; radius?: number } = $props();

  const patternId = $derived('hazard-' + id);
  const glowId = $derived('hazard-glow-' + id);
</script>

<svg class="hazard" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <!-- 45° stripes. patternUnits userSpaceOnUse keeps the stripe pitch constant while
         preserveAspectRatio="none" stretches the rest to the room's shape. -->
    <pattern
      id={patternId}
      width="8"
      height="8"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <rect width="8" height="8" fill="#12100a" />
      <rect width="4" height="8" fill="#f5c518" />
    </pattern>
    <filter id={glowId} x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur stdDeviation="1.6" result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <rect
    class="wash"
    x="1"
    y="1"
    width="98"
    height="98"
    rx={radius}
    ry={radius}
    fill="#f5c518"
  />
  <rect
    class="stripes"
    x={thickness / 2}
    y={thickness / 2}
    width={100 - thickness}
    height={100 - thickness}
    rx={radius}
    ry={radius}
    fill="none"
    stroke={'url(#' + patternId + ')'}
    stroke-width={thickness}
    filter={'url(#' + glowId + ')'}
  />
</svg>

{#if fuse !== null}
  <div class="fuse" class:critical={fuse <= 1}>
    <span class="label">FUSE</span>
    <span class="value">{fuse}</span>
  </div>
{/if}

<style>
  .hazard {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    animation: pulse 2.4s ease-in-out infinite;
  }

  .wash {
    opacity: 0.07;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.92;
    }
    50% {
      opacity: 0.62;
    }
  }

  .fuse {
    position: absolute;
    top: -0.6rem;
    right: -0.6rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.6rem 0.25rem 0.55rem;
    background: #12100a;
    border: 2px solid #f5c518;
    border-radius: 999px;
    box-shadow: 0 0 18px rgba(245, 197, 24, 0.35);
    pointer-events: none;
  }

  .fuse .label {
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    color: #f5c518;
    font-weight: 700;
  }

  .fuse .value {
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    font-size: 1.35rem;
    line-height: 1;
    font-weight: 700;
    color: #fff;
  }

  .fuse.critical {
    border-color: #ff6b3d;
    box-shadow: 0 0 22px rgba(255, 107, 61, 0.5);
    animation: blink 1s steps(2, end) infinite;
  }

  .fuse.critical .label {
    color: #ff6b3d;
  }

  @keyframes blink {
    50% {
      opacity: 0.45;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hazard,
    .fuse.critical {
      animation: none;
    }
  }
</style>
