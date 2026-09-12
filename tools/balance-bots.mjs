// Simulation-only bots. All decisions receive the engine's public whitelist, never GameState.
import { ROOMS, focusTiles, isLegalBreak } from '../packages/engine/dist/index.js';

export const PROFILES = {
  casual: { wander: 0.20, noise: 1.1, decay: 0.75, follow: 0.45, reserve: 1, error: 0.25 },
  typical: { wander: 0.08, noise: 0.55, decay: 0.88, follow: 0.70, reserve: 2, error: 0.12 },
  coordinated: { wander: 0.02, noise: 0.20, decay: 0.96, follow: 0.90, reserve: 2, error: 0.04 },
};
export const alive = s => s.players.filter(p => p.alive);
export function mind(id, role, teammates, profile, rng) {
  return { id, role, teammates, profile, suspicion: {}, skipped: false,
    // Persistent differences between people, in addition to decision-level noise.
    bias: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`p${i}`, (rng.next() - .5) * profile.noise])) };
}
const score = (m, id) => (m.suspicion[id] ?? 0) + (m.bias[id] ?? 0);
const legalState = s => ({ ...s, rooms: Object.fromEntries(s.rooms.map(r => [r.id, r])) });

/** Public rotating roster; reserves Med bay workers against a same-round X-ray smash. */
export function allocation(s, profile, rng) {
  const cfg = s.config;
  const pool = rng.shuffle(alive(s));
  const slots = [];
  for (const r of s.rooms.filter(r => r.broken).sort((a, b) => a.fuse - b.fuse)) slots.push(r.id);
  const free = pool.length - slots.length;
  let best = { value: -Infinity, rooms: [] };
  for (let med = 0; med <= Math.min(free, cfg.medbaySeats); med++) {
    for (let cargo = 0; cargo <= free - med; cargo++) {
      const reactor = Math.min(free - med - cargo, cfg.reactorCapCells);
      const budget = s.scrap + cargo * cfg.scrapPerCargoWorker;
      if (budget < med * cfg.repairCostScrap) continue;
      const useful = s.xrayOnline ? Math.min(med, profile.reserve) : Math.min(med, Math.ceil((cfg.repairTarget - s.repairProgress) / cfg.repairSuccessChance) + 1);
      const medValue = s.xrayOnline ? (useful ? 4.5 + (useful - 1) * 2 : 0) : useful * 3.4;
      const cellsValue = reactor * (s.powerCells < cfg.scanCostCells ? 2 : s.xrayOnline ? 1.7 : 0.9);
      const stockValue = Math.min(Math.max(0, budget - med), 3) * .18;
      const value = medValue + cellsValue + stockValue;
      if (value > best.value) best = { value, rooms: [...Array(med).fill('medbay'), ...Array(cargo).fill('cargo'), ...Array(reactor).fill('reactor')] };
    }
  }
  slots.push(...best.rooms);
  while (slots.length < pool.length) slots.push(slots.includes('steering') ? 'oxygen' : 'steering');
  // Verified players take urgent repairs; all assignments depend only on public status.
  pool.sort((a, b) => Number(b.verified) - Number(a.verified));
  return Object.fromEntries(pool.map((p, i) => [p.id, slots[i]]));
}

export function crewAction(m, s, plan, rng) {
  const room = rng.chance(m.profile.wander) ? rng.pick(ROOMS) : plan[m.id];
  return { room, focus: room, action: 'WORK' };
}

/** Team knows its own identities and the announced roster, but not crew deviations or RNG. */
export function mimicActions(ms, s, plan, rng) {
  const actions = Object.fromEntries(ms.map(m => [m.id, { room: plan[m.id], focus: plan[m.id], action: 'WORK' }]));
  const options = [];
  const cfg = s.config;
  for (const m of ms) for (const room of ROOMS) for (const focus of focusTiles(room)) {
    const counts = Object.fromEntries(ROOMS.map(r => [r, Object.entries(plan).filter(([id, x]) => id !== m.id && x === r).length]));
    const cover = Math.max(1, counts[room]);
    let value = -Infinity;
    if (isLegalBreak(legalState(s), room, focus)) {
      if (focus === 'medbay') {
        const funded = Math.min(counts.medbay, Math.floor((s.scrap + counts.cargo * 2) / cfg.repairCostScrap));
        value = 3 + 10 * Math.pow(1 - cfg.repairSuccessChance, funded);
      } else {
        const unattended = counts[focus] === 0;
        value = 2 + (unattended ? 3 : 0) + (focus === 'reactor' ? 2 : 0);
        if (unattended && s.round + cfg.fuseLength <= cfg.rounds) value += 1;
      }
    } else if (room === focus) {
      if (room === 'medbay' && !s.xrayOnline && counts.medbay) value = 5 + (s.repairProgress >= cfg.repairTarget - 2 ? 2 : 0);
      if (room === 'reactor' && s.powerCells > 0) {
        const produced = Math.min(counts.reactor, cfg.reactorCapCells);
        value = 2 + (s.xrayOnline && s.powerCells + produced >= cfg.scanCostCells && Math.max(0, s.powerCells - cfg.stealAmount) + produced < cfg.scanCostCells ? 9 : 0);
      }
      if (room === 'cargo' && s.scrap > 0 && !s.xrayOnline) value = 3 + (s.scrap < counts.medbay ? 2 : 0);
    }
    if (!Number.isFinite(value)) continue;
    // Lost production / easily attributable sabotage / abandoning the public assignment.
    value -= 1.5 / cover + Math.max(0, score(m, m.id)) * .35;
    if (room !== plan[m.id]) value -= .7;
    value += (rng.next() - .5) * m.profile.noise * 2;
    options.push({ id: m.id, room, focus, action: 'SABO', value });
  }
  options.sort((a, b) => b.value - a.value);
  if (options.length) {
    const pick = rng.chance(ms[0].profile.error) ? rng.pick(options.slice(0, 8)) : options[0];
    if (pick.value > 0) actions[pick.id] = { room: pick.room, focus: pick.focus, action: pick.action };
  }
  return actions;
}

/** Use reported production, not resource deltas confused by repair spending or capped output. */
export function observe(m, before, after, rng) {
  for (const id of Object.keys(m.suspicion)) m.suspicion[id] *= m.profile.decay;
  const report = after.lastReport;
  const byName = Object.fromEntries(after.players.map(p => [p.name, p.id]));
  const occupants = Object.fromEntries(report.rooms.map(r => [r.room, r.workers.map(n => byName[n])]));
  const add = (ids, weight) => {
    const eligible = ids.filter(id => after.players.some(p => p.id === id && p.alive && !p.verified));
    for (const id of eligible) m.suspicion[id] = (m.suspicion[id] ?? 0) + weight / Math.max(1, eligible.length) * (1 + (rng.next() - .5) * m.profile.noise);
  };
  const breaks = report.rooms.filter(r => r.summary.includes('smashed') || (!before.rooms.find(x => x.id === r.room).broken && (r.broken || r.summary.includes('repaired'))));
  for (const broken of breaks) {
    const possible = ROOMS.filter(room => isLegalBreak(legalState(before), room, broken.room));
    add(possible.flatMap(room => occupants[room]), 3);
  }
  for (const room of ['reactor', 'cargo']) {
    const row = report.rooms.find(r => r.room === room);
    const unit = room === 'reactor' ? after.config.cellsPerReactorWorker : after.config.scrapPerCargoWorker;
    const n = Math.max(0, occupants[room].length - Number(row.summary.includes('repaired')));
    const expected = Math.min(n * unit, room === 'reactor' ? after.config.reactorCapCells : Infinity);
    const produced = Number(/\+(\d+)/.exec(row.summary)?.[1] ?? 0);
    if (produced < expected) add(occupants[room], 4);
  }
  // Bad repair luck is weak evidence, never certainty. Exclude rounds with an observed break.
  if (!breaks.length && !before.xrayOnline && occupants.medbay.length >= 2) {
    const cargo = report.rooms.find(r => r.room === 'cargo');
    const produced = Number(/\+(\d+)/.exec(cargo.summary)?.[1] ?? 0);
    const funded = Math.min(occupants.medbay.length, Math.floor((before.scrap + produced) / after.config.repairCostScrap));
    const repairs = Number(/\+(\d+) repair/.exec(report.rooms.find(r => r.room === 'medbay').summary)?.[1] ?? 0);
    if (repairs < funded * after.config.repairSuccessChance - 1) add(occupants.medbay, .6);
  }
}

function rank(m, s, rng, candidates = alive(s).map(p => p.id)) {
  return alive(s).filter(p => candidates.includes(p.id) && !p.verified && p.id !== m.id && !m.teammates.includes(p.id))
    .map(p => ({ id: p.id, value: score(m, p.id) + (rng.next() - .5) * 2 * m.profile.noise }))
    .sort((a, b) => b.value - a.value);
}
/** One proposal each; public endorsements give the group a focal target without unanimity. */
export function discuss(ms, s, rng) {
  const nominations = ms.map(m => ({ speaker: m.id, target: rank(m, s, rng)[0]?.id }));
  const totals = {};
  for (const n of nominations) if (n.target) {
    const verified = s.players.find(p => p.id === n.speaker).verified;
    totals[n.target] = (totals[n.target] ?? 0) + (verified ? 1.5 : 1);
  }
  const order = rng.shuffle(Object.keys(totals));
  order.sort((a, b) => totals[b] - totals[a]);
  return order;
}
export function ballot(m, s, proposals, rng) {
  const ranked = rank(m, s, rng, s.vote.candidates);
  const proposed = proposals.find(id => ranked.some(p => p.id === id));
  if (proposed && rng.chance(m.profile.follow)) return proposed;
  if (ranked.length) return ranked[0].id;
  if (s.vote.allowSkip && !m.skipped) return 'SKIP';
  // In an all-Mimic runoff a Mimic prefers a verified crew if present, otherwise must name a teammate.
  return s.vote.candidates.find(id => id !== m.id) ?? m.id;
}
export function observeVote(m, s) {
  const v = s.vote;
  if (!v || v.result?.kind !== 'SCAN' || s.hiddenVotes) return;
  const caught = v.result.revealed === 'MIMIC';
  for (const b of v.ballots) {
    if (b.choice === 'SKIP') continue;
    const delta = caught ? (b.choice === v.result.playerId ? -.4 : .5) : (b.choice === v.result.playerId ? .12 : 0);
    m.suspicion[b.voterId] = (m.suspicion[b.voterId] ?? 0) + delta;
  }
}
