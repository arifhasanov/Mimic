<script lang="ts">
  import { onMount } from 'svelte';

  /**
   * Slow parallax starfield. The ship flies left to right, so the stars drift right to
   * left. Three layers at different speeds and sizes give depth without ever pulling the
   * eye away from the map — the whole point is that it reads as "we are moving" from three
   * metres and is invisible from thirty centimetres.
   */
  let { density = 1, speed = 1 }: { density?: number; speed?: number } = $props();

  let canvas: HTMLCanvasElement;

  onMount(() => {
    const ctx = canvas.getContext('2d')!;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();

    type Star = { x: number; y: number; r: number; v: number; a: number; tw: number };
    let stars: Star[] = [];

    const LAYERS = [
      { count: 0.55, r: [0.5, 0.9], v: [2, 5], a: [0.25, 0.5] },
      { count: 0.32, r: [0.8, 1.4], v: [6, 11], a: [0.4, 0.7] },
      { count: 0.13, r: [1.3, 2.2], v: [13, 20], a: [0.65, 1] },
    ];

    const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

    function build() {
      const area = (width * height) / (1920 * 1080);
      const total = Math.round(260 * density * Math.max(0.35, area));
      stars = [];
      for (const layer of LAYERS) {
        const n = Math.round(total * layer.count);
        for (let i = 0; i < n; i++) {
          stars.push({
            x: Math.random() * width,
            y: Math.random() * height,
            r: rand(layer.r[0], layer.r[1]),
            v: rand(layer.v[0], layer.v[1]),
            a: rand(layer.a[0], layer.a[1]),
            tw: Math.random() * Math.PI * 2,
          });
        }
      }
    }

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    function frame(now: number) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);

      for (const s of stars) {
        s.x -= s.v * speed * dt;
        if (s.x < -4) {
          s.x = width + 4;
          s.y = Math.random() * height;
        }
        s.tw += dt * 0.7;
        const alpha = s.a * (0.75 + 0.25 * Math.sin(s.tw));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.r > 1.25 ? '#cfe4f0' : '#9fb6c4';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    resize();
    if (reduce?.matches) {
      // Still paint one frame, just never move it.
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        ctx.globalAlpha = s.a;
        ctx.fillStyle = s.r > 1.25 ? '#cfe4f0' : '#9fb6c4';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      raf = requestAnimationFrame(frame);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  });
</script>

<canvas class="starfield" bind:this={canvas} aria-hidden="true"></canvas>

<style>
  .starfield {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
    z-index: 0;
  }
</style>
