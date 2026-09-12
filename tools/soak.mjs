/**
 * Soak test. Runs whole games through the real GamesService with the phase clock scaled
 * down, including one seat that never submits and never votes (a human who put the phone
 * down) and, with `manual`, a scripted host pressing Next. Watches for a game that stops
 * advancing, a throw out of a timer, and any round that resolved without a vote although
 * the scan conditions were met — then lists the rounds where the X-ray was up but the
 * cells were short, which is what a table reads as "the vote never came".
 *
 *   node tools/soak.mjs [games] [bots] [manual]
 */
import { GamesService } from '../apps/server/dist/games.service.js';
import { shouldVote } from '../packages/engine/dist/index.js';

const GAMES = Number(process.argv[2] ?? 8);
const BOTS = Number(process.argv[3] ?? 7);
const MANUAL = process.argv[4] === 'manual';

const SECONDS = { LOBBY: 0, ROLES: 0.3, REPORT: 0.3, TALK: 0.6, ACT: 2, RESOLVE: 0.6, VOTE: 2, GAME_OVER: 0 };

class FastGames extends GamesService {
  seconds(_g, phase) {
    return SECONDS[phase] ?? 0.3;
  }
}

const noVoteWithXray = [];
const problems = [];
process.on('uncaughtException', (e) => {
  problems.push('UNCAUGHT: ' + (e && e.stack));
});

function runOne(index) {
  return new Promise((resolve) => {
    const svc = new FastGames();
    const seen = [];
    let lastChange = Date.now();
    let done = false;
    let pending = null;
    let code, hostToken;

    const finish = (why) => {
      if (done) return;
      done = true;
      clearInterval(watchdog);
      try {
        svc.onModuleDestroy();
      } catch {}
      resolve({ index, why, seen });
    };

    svc.setEmitter({
      broadcast(c, event, payload) {
        if (event !== 'state') return;
        const s = payload;
        const key = s.phase + ':' + s.round + ':' + (s.vote ? s.vote.stage : '');
        if (seen[seen.length - 1] !== key) {
          seen.push(key);
          lastChange = Date.now();
          const g = svc.get(c);
          if (s.phase === 'RESOLVE') {
            pending = { round: s.round, want: shouldVote(g.state), cells: s.powerCells, xray: s.xrayOnline, cost: s.config.scanCostCells };
          } else if (pending) {
            if (pending.xray && s.phase !== 'VOTE' && s.phase !== 'GAME_OVER')
              noVoteWithXray.push(`g${index} r${pending.round}: cells ${pending.cells}/${pending.cost} want=${pending.want}`);
            if (pending.want && s.phase !== 'VOTE' && s.phase !== 'GAME_OVER')
              problems.push(`g${index} r${pending.round}: shouldVote true but went to ${s.phase}`);
            pending = null;
          }
        }
        if (s.phase === 'GAME_OVER') finish('over');
      },
      toToken() {},
      evict() {},
      closeRoom() {},
    });

    ({ code, hostToken } = svc.create());
    for (let i = 0; i < BOTS; i++) svc.addBot(code, hostToken);
    // One seat that behaves like a human who never touches the phone.
    svc.join(code, 'Human');
    const g = svc.get(code);
    g.state.fastPhases = true;
    g.state.manualSteps = MANUAL;
    const started = svc.start(code, hostToken);
    if (!started.ok) return finish('start failed: ' + started.error);

    const watchdog = setInterval(() => {
      // A scripted host, pressing Next whenever the game is waiting for one.
      if (MANUAL && g.pendingNext) svc.next(code, hostToken, g.state.step);
      if (Date.now() - lastChange > 30000) {
        problems.push(`g${index}: stuck after ${seen[seen.length - 1]}`);
        finish('stuck');
      }
    }, MANUAL ? 150 : 1000);
  });
}

const results = await Promise.all(Array.from({ length: GAMES }, (_, i) => runOne(i)));
console.log(results.map((r) => `game ${r.index}: ${r.why}, ${r.seen.length} steps`).join('\n'));
console.log('\nrounds with X-ray online but no vote: ' + noVoteWithXray.length);
for (const n of noVoteWithXray.slice(0, 40)) console.log('  ' + n);
console.log('\nproblems: ' + problems.length);
for (const p of problems) console.log(' - ' + p);
