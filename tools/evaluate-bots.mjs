// Headless exercise of production bots, talk planner, voice and engine. Build first.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as e from '../packages/engine/dist/index.js';
import b from '../apps/server/dist/bots/index.js';

const games = Number(process.argv[2] ?? 100);
assert(Number.isInteger(games) && games > 0 && games <= 10000);
const sabotageMode = process.argv[3] ?? 'each';
assert(['team', 'each'].includes(sabotageMode));
const results = [];
let sample = [];
for (const skill of ['EASY', 'NORMAL', 'HARD']) {
  const stats = { skill, games, crewWins: 0, spoken: 0, suppressed: 0, exactRepeats: 0, meanFirstXray: 0, xrayGames: 0 };
  for (let seed = 1; seed <= games; seed++) {
    const rng = e.createRng(seed), chat = [];
    let s = e.createGame('TEST', seed);
    s.settings.custom = { sabotagesPerRound: sabotageMode };
    s.botSkill = skill;
    s.players = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: b.BOT_NAMES[i], token: `t${i}`, role: 'CREW', alive: true, verified: false, room: null, connected: true, isBot: true }));
    s = e.startGame(s, rng);
    const minds = s.players.map((p, i) => b.createMind(p.id, b.PERSONALITIES[i % 4], skill));
    const pace = { windowMs: 60000, fast: false };
    let firstXray = null, xrayJustUp = false;
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
      s = e.resolveRound(s, rng).state;
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
          for (const m of minds) b.absorbVote(m, s, rng);
          speak(b.planVoteReactions(minds, s, rng, pace));
          if (result.outcome.kind !== 'RUNOFF') break;
          s = e.startVote(s, 'RUNOFF', result.outcome.candidates);
        }
      }
      s = e.checkEndOfGame(s);
      assert(s.round <= s.config.rounds);
    }
    stats.crewWins += Number(s.winner === 'CREW');
    if (firstXray !== null) { stats.xrayGames++; stats.meanFirstXray += firstXray; }
    if (skill === 'NORMAL' && seed === 1) sample = chat;
  }
  stats.meanFirstXray /= stats.xrayGames || 1;
  results.push(stats);
  console.log(JSON.stringify(stats));
}
mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./results/in-game-bots-${sabotageMode}.json`, import.meta.url), JSON.stringify({ seeds: `1..${games} per difficulty`, players: 10, balance: 0, sabotageMode, note: 'Production-bot smoke evaluation; not a human balance estimate or an isolated before/after comparison.', results }, null, 2) + '\n');
writeFileSync(new URL(`./results/in-game-bots-${sabotageMode}-chat.md`, import.meta.url), `# Normal bots: sample conversation\n\nBalanced, 10 players, ${sabotageMode} sabotage, seed 1.\n\n` + sample.map(l => `- Round ${l.round}, **${l.name}**: ${l.text}`).join('\n') + '\n');
