// Headless exercise of production bots, talk planner, voice and engine. Build first.
//
//   node tools/evaluate-bots.mjs [games=100] [each|team] [matrix]
//
// Without `matrix`, every seat plays at the same skill and the three skills are compared.
// With `matrix`, every crew skill is played against every Mimic skill, so each side can be
// tuned on its own: a cell like "HARD crew vs EASY Mimics" says how well the crew brain
// reads the table when the Mimics are careless, and the diagonal is the balanced game.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as e from '../packages/engine/dist/index.js';
import b from '../apps/server/dist/bots/index.js';

const games = Number(process.argv[2] ?? 100);
assert(Number.isInteger(games) && games > 0 && games <= 10000);
const sabotageMode = process.argv[3] ?? 'each';
assert(['team', 'each'].includes(sabotageMode));
const matrix = process.argv[4] === 'matrix';
const SKILLS = ['EASY', 'NORMAL', 'HARD'];
const pairs = matrix ? SKILLS.flatMap((crew) => SKILLS.map((mimic) => [crew, mimic])) : SKILLS.map((s) => [s, s]);

const results = [];
let sample = [];
for (const [crewSkill, mimicSkill] of pairs) {
  const stats = {
    crewSkill, mimicSkill, games, crewWins: 0,
    // How the games ended.
    breaches: 0, allFound: 0, contained: 0, relay: 0,
    // How well each side played.
    scans: 0, scansOnMimics: 0, scansOnCrew: 0, skippedVotes: 0, tiedVotes: 0,
    meanFirstCorrectScan: 0, correctScanGames: 0, meanMimicsCaught: 0, meanFinalInfection: 0, meanSabotages: 0,
    // The chat.
    spoken: 0, suppressed: 0, exactRepeats: 0, meanFirstXray: 0, xrayGames: 0,
  };
  for (let seed = 1; seed <= games; seed++) {
    const rng = e.createRng(seed), chat = [];
    let s = e.createGame('TEST', seed);
    s.settings.custom = { sabotagesPerRound: sabotageMode };
    s.botSkill = crewSkill;
    s.players = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: b.BOT_NAMES[i], token: `t${i}`, role: 'CREW', alive: true, verified: false, room: null, connected: true, isBot: true }));
    s = e.startGame(s, rng);
    const minds = s.players.map((p, i) => b.createMind(p.id, b.PERSONALITIES[i % 4], p.role === 'MIMIC' ? mimicSkill : crewSkill));
    const pace = { windowMs: 60000, fast: false };
    let firstXray = null, xrayJustUp = false, firstCorrect = null, sabotages = 0;
    const speak = lines => {
      for (const line of lines) {
        const m = minds.find(m => m.id === line.playerId);
        if (!s.players.find(p => p.id === m.id).alive) continue;
        const text = b.render(line.utterance, { personality: m.personality, rng, name: id => s.players.find(p => p.id === id)?.name ?? 'someone', round: s.round, recent: chat.slice(-400).map(l => l.text) });
        if (!text) { stats.suppressed++; continue; }
        if (chat.some(l => l.text === text)) stats.exactRepeats++;
        stats.spoken++;
        chat.push({ round: s.round, name: s.players.find(p => p.id === m.id).name, text });
      }
    };
    while (!s.winner) {
      s = e.beginRound(s);
      if (s.winner) break;
      s.phase = 'TALK';
      speak(b.planTalk(minds, s, rng, pace, { xrayJustUp }));
      s.phase = 'ACT';
      const before = b.snapshot(s);
      for (const p of e.livingPlayers(s)) {
        const action = b.chooseAction(minds.find(m => m.id === p.id), s, rng);
        assert(e.isWellFormedSubmission(action.room, action.focus, action.action));
        s.submissions[p.id] = { playerId: p.id, ...action };
      }
      const resolved = e.resolveRound(s, rng);
      s = resolved.state;
      sabotages += resolved.report.intents.filter((i) => i.intent !== 'WORK').length;
      for (const m of minds) b.absorbRound(m, s, before, rng);
      xrayJustUp = !before.xrayOnline && s.xrayOnline;
      if (s.xrayOnline && firstXray === null) firstXray = s.round;
      speak(b.planReactions(minds, s, before, rng, pace));
      if (e.shouldVote(s)) {
        s = e.startVote(s);
        for (let stage = 0; stage < 2; stage++) {
          for (const id of s.vote.voters) {
            const result = e.castBallot(s, id, b.chooseBallot(minds.find(m => m.id === id), s, rng).choice);
            assert(result.ok, result.error); s = result.state;
          }
          const result = e.resolveVote(s); s = result.state;
          const o = result.outcome;
          if (o.kind === 'SCAN') {
            stats.scans++;
            if (o.role === 'MIMIC') { stats.scansOnMimics++; if (firstCorrect === null) firstCorrect = s.round; }
            else stats.scansOnCrew++;
          } else if (o.kind === 'SKIP') stats.skippedVotes++;
          else if (o.kind === 'TIE') stats.tiedVotes++;
          for (const m of minds) b.absorbVote(m, s, rng);
          speak(b.planVoteReactions(minds, s, rng, pace));
          if (o.kind !== 'RUNOFF') break;
          s = e.startVote(s, 'RUNOFF', o.candidates);
        }
      }
      s = e.checkEndOfGame(s);
      assert(s.round <= s.config.rounds);
    }
    stats.crewWins += Number(s.winner === 'CREW');
    stats[{ HULL_BREACH: 'breaches', ALL_MIMICS_FOUND: 'allFound', INFECTION_CONTAINED: 'contained', REACHED_THE_RELAY: 'relay' }[s.winReason]] += 1;
    stats.meanMimicsCaught += s.players.filter((p) => !p.alive).length;
    stats.meanFinalInfection += s.infection;
    stats.meanSabotages += sabotages;
    if (firstCorrect !== null) { stats.correctScanGames++; stats.meanFirstCorrectScan += firstCorrect; }
    if (firstXray !== null) { stats.xrayGames++; stats.meanFirstXray += firstXray; }
    if (crewSkill === 'NORMAL' && mimicSkill === 'NORMAL' && seed === 1) sample = chat;
  }
  stats.meanFirstXray = +(stats.meanFirstXray / (stats.xrayGames || 1)).toFixed(2);
  stats.meanFirstCorrectScan = +(stats.meanFirstCorrectScan / (stats.correctScanGames || 1)).toFixed(2);
  stats.meanMimicsCaught = +(stats.meanMimicsCaught / games).toFixed(2);
  stats.meanFinalInfection = +(stats.meanFinalInfection / games).toFixed(2);
  stats.meanSabotages = +(stats.meanSabotages / games).toFixed(2);
  results.push(stats);
  console.log(JSON.stringify(stats));
}
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
const suffix = matrix ? '-matrix' : '';
writeFileSync(new URL(`./results/in-game-bots-${sabotageMode}${suffix}.json`, import.meta.url), JSON.stringify({ seeds: `1..${games} per cell`, players: 10, balance: 0, sabotageMode, matrix, note: 'Production-bot smoke evaluation; not a human balance estimate or an isolated before/after comparison.', results }, null, 2) + '\n');
if (sample.length)
  writeFileSync(new URL(`./results/in-game-bots-${sabotageMode}-chat.md`, import.meta.url), `# Normal bots: sample conversation\n\nBalanced, 10 players, ${sabotageMode} sabotage, seed 1.\n\n` + sample.map(l => `- Round ${l.round}, **${l.name}**: ${l.text}`).join('\n') + '\n');
