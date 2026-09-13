<script lang="ts">
  import type { PublicState } from '$lib/types';

  let { gameState, compact = false }: { gameState: PublicState; compact?: boolean } = $props();
  const rules = $derived(gameState.infectionRules);
  const level = $derived(gameState.infection);
  const breached = $derived(level >= rules.threshold);
  const delta = $derived(gameState.lastReport?.infectionDelta ?? 0);
</script>

<section class="infection" class:breached class:compact aria-label="Alien infection">
  <div class="identity">
    <span class="organism" aria-hidden="true">☣</span>
    <div>
      <span class="eyebrow">Xeno-organism detected</span>
      <h2 class="cond">INFECTION</h2>
      <span class="reading mono" aria-live="polite">{level}<small> / {rules.max}</small></span>
    </div>
  </div>

  <div class="instrument">
    <div class="track-head">
      <span class="condition">{breached ? 'Relay defences compromised' : 'Below relay breach threshold'}</span>
      <span class="change mono">{gameState.lastReport ? `${delta > 0 ? '+' : ''}${delta} last round` : 'Awaiting first round'}</span>
    </div>
    <div class="scale">
      <div class="tube" role="progressbar" aria-label="Infection level"
        aria-valuemin={0} aria-valuemax={rules.max} aria-valuenow={level}
        aria-valuetext={`${level} of ${rules.max}. Mimics need ${rules.threshold} and a survivor at arrival.`}>
        <div class="fluid" class:empty={level === 0} style:width={`${level / rules.max * 100}%`}>
          <div class="cells"></div>
          <svg class="veins" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 38 Q55 4 112 30 T220 25 T330 42 T440 15 T550 34 T660 20 T770 40 T880 21 T1000 30 M70 27l24 28m95-29 35-23m65 39 30 17m76-36 25-18m70 23 27 29m80-25 28-28m95 32 31 19m77-34 32-15m72 23 36 27" />
          </svg>
        </div>
        <div class="glass"></div>
      </div>
      <div class="danger-zone" style:left={`${rules.threshold / rules.max * 100}%`} aria-hidden="true"></div>
      {#each Array.from({ length: rules.max + 1 }, (_, i) => i) as tick}
        <div class="tick" class:threshold={tick === rules.threshold} style:left={`${tick / rules.max * 100}%`} aria-hidden="true">
          <i></i><span class="mono">{tick}</span>
        </div>
      {/each}
    </div>
    <div class="rules">
      <span>Effective sabotage <b>+{rules.gain}</b>{compact ? '' : ' / round'} <em>·</em> Quiet{compact ? '' : ' round'} <b>−{rules.decay}</b></span>
      <span class="objective">{compact ? 'Need' : 'Mimics need'} <b>{rules.threshold}{compact ? '' : ` / ${rules.max}`}</b> {compact ? '+ survivor' : 'and a survivor'} at arrival</span>
    </div>
  </div>
</section>

<style>
  .infection {
    --acid: #beef63;
    position: relative;
    isolation: isolate;
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    align-items: center;
    gap: 1.7rem;
    flex-shrink: 0;
    width: 100%;
    padding: 1rem 1.6rem;
    border: 1px solid #496338;
    border-radius: 14px;
    background: radial-gradient(ellipse at 0% 100%, #39561c40, transparent 50%), linear-gradient(110deg, #101c16, #0b1415 65%);
    box-shadow: inset 0 1px #b9e97e15, inset 0 -12px 26px #0005, 0 0 26px #94d23b08;
  }
  .infection::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    opacity: .15;
    background: repeating-linear-gradient(0deg, transparent 0 3px, #b7db9020 3px 4px);
    pointer-events: none;
  }
  .identity { display: flex; align-items: center; gap: 1rem; }
  .organism { font-size: 3.4rem; color: var(--acid); text-shadow: 0 0 20px #a4f44250; }
  .eyebrow { font-size: .62rem; color: #92a782; letter-spacing: .15em; }
  h2 { margin: .15rem 0 0; color: #d6edbe; font-size: 1.8rem; line-height: 1; letter-spacing: .1em; }
  .reading { color: var(--acid); font-size: 1.65rem; font-weight: 700; }
  .reading small { color: #839578; font-size: .9rem; font-weight: 400; }
  .instrument { min-width: 0; }
  .track-head { display: flex; justify-content: space-between; gap: .75rem; margin-bottom: .55rem; }
  .condition { color: #b3c2a7; text-transform: uppercase; font-size: .78rem; letter-spacing: .13em; }
  .change { color: #9aaf8b; font-size: .75rem; }
  .scale { position: relative; margin: 0 .3rem; padding-bottom: 1.75rem; }
  .tube { position: relative; height: 34px; overflow: hidden; border: 1px solid #577c39; border-radius: 7px; background: #030b08; box-shadow: inset 0 3px 12px #000; }
  .fluid { position: absolute; inset: 0 auto 0 0; overflow: hidden; transition: width 1.2s cubic-bezier(.2,.75,.2,1); border-right: 2px solid #e6ffb3; background: linear-gradient(0deg, #254e14 0%, #69b329 30%, #b8de53 55%, #519626 80%, #1c4117 100%); box-shadow: 3px 0 16px #ccff87, inset 0 0 12px #c9ff7940; }
  .fluid.empty { border-right: 0; box-shadow: none; }
  .cells { position: absolute; inset: -60px -30px; background: radial-gradient(ellipse at center, #e1ffa96b 0 9%, #0e2c13a8 14% 22%, transparent 30%) 0 0 / 57px 43px, radial-gradient(ellipse at center, #dbff9899 0 6%, #264b17a6 10% 20%, transparent 27%) 20px 16px / 83px 57px; transform: rotate(-8deg); animation: crawl 16s ease-in-out infinite alternate; }
  .veins { position: absolute; inset: 0; width: 100%; height: 100%; fill: none; stroke: #122e14; stroke-width: 2; opacity: .6; }
  .glass { position: absolute; inset: 0; background: linear-gradient(0deg, #0007, transparent 35%, #e5ffd914 80%, #edffdc2b), repeating-linear-gradient(90deg, transparent 0 8px, #c7ef9012 8px 9px); }
  .danger-zone { position: absolute; top: -3px; right: 0; height: 40px; border-left: 2px solid #f2cf82; pointer-events: none; background: repeating-linear-gradient(125deg, transparent 0 12px, #f3d0830c 12px 15px); }
  .tick { position: absolute; top: 0; display: flex; flex-direction: column; align-items: center; transform: translateX(-50%); color: #aebda2; }
  .tick i { height: 39px; width: 1px; border-top: 7px solid #e2f5c855; border-bottom: 5px solid #89a16b; }
  .tick span { margin-top: 2px; font-size: .82rem; }
  .tick.threshold { color: #f2cf82; font-weight: 700; }
  .tick.threshold i { border-color: #f2cf82; }
  .rules { display: flex; justify-content: space-between; gap: 1rem; font-size: .8rem; color: #9aad8e; }
  .rules b { color: #d0ecad; font-weight: 600; }
  .rules em { font-style: normal; margin: 0 .5rem; color: #526b44; }
  .objective { text-align: right; }
  .objective b { color: #f2cf82; }
  .breached { border-color: #94b858; box-shadow: inset 0 1px #c5ef7830, 0 0 25px #98d33f12; }
  .breached .condition { color: #e0f8a9; }
  @keyframes crawl { to { transform: translate(18px, 6px) rotate(-5deg); } }
  @media (prefers-reduced-motion: reduce) { .cells { animation: none; } .fluid { transition: none; } }
  @media (max-width: 1100px) {
    .infection { grid-template-columns: 170px minmax(0, 1fr); padding: .8rem 1rem; gap: 1rem; }
    .organism { font-size: 2.5rem; }
    h2 { font-size: 1.4rem; }
    .rules { font-size: .72rem; gap: .5rem; }
    .condition { font-size: .68rem; letter-spacing: .06em; }
  }
  @media (max-width: 650px) {
    .infection { grid-template-columns: 1fr; gap: .7rem; }
    .identity > div { display: flex; align-items: center; gap: .8rem; }
    .identity .eyebrow { display: none; }
    .organism { font-size: 1.8rem; }
    .rules { flex-wrap: wrap; }
    .objective { text-align: left; }
    .change { font-size: .65rem; }
  }
  .infection.compact {
    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
    align-content: center;
    gap: .35rem;
    padding: .65rem 1.1rem .7rem;
    border: 0;
    border-radius: 0;
    box-shadow: inset 0 1px #b9e97e15;
  }
  .compact .identity { gap: .5rem; }
  .compact .identity > div { display: flex; align-items: center; flex: 1; gap: .6rem; }
  .compact .identity .eyebrow { display: none; }
  .compact .organism { font-size: 1.6rem; line-height: 1; }
  .compact h2 { margin: 0; font-size: 1.2rem; }
  .compact .reading { margin-left: auto; font-size: 1.25rem; line-height: 1; }
  .compact .reading small { font-size: .8rem; }
  .compact .track-head { flex-wrap: wrap; gap: .2rem .5rem; margin-bottom: .4rem; }
  .compact .condition { font-size: .65rem; letter-spacing: .08em; }
  .compact .change { font-size: .65rem; }
  .compact .scale { margin: 0 .4rem; padding-bottom: 1.45rem; }
  .compact .tube { height: 26px; }
  .compact .danger-zone { height: 32px; }
  .compact .tick i { height: 31px; }
  .compact .tick span { font-size: .72rem; }
  .compact .rules { flex-wrap: wrap; gap: .2rem .7rem; font-size: .7rem; }
  .compact .rules em { margin: 0 .2rem; }
  .compact .objective { text-align: left; }
</style>
