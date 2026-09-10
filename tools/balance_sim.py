"""MIMIC v1 balance simulator. Implements spec sections 4-12 exactly; adds heuristic bots."""
import random, math, sys
from collections import defaultdict, Counter

ROOMS = ['steering','reactor','cargo','medbay','oxygen']
BREAKABLE = {'steering','reactor','oxygen'}
PIPES = [('reactor','cargo'),('cargo','steering'),('steering','medbay'),('medbay','oxygen'),('oxygen','reactor'),('reactor','medbay')]  # v1.1 orientation, nose on the right
ADJ = defaultdict(set)
for a,b in PIPES: ADJ[a].add(b); ADJ[b].add(a)

CFG = dict(rounds=10, repairTarget=6, p=0.6, scanCost=2, fuse=3, scrapPer=2, cellsPer=1,
           repairCost=1, startScrap=2, startCells=0, reactorCap=99, medbayCap=99)

def aliens_for(n): return 1 if n<=6 else 2 if n<=9 else 3

def binom(n,k,p):
    if k<0 or k>n: return 0.0
    return math.comb(n,k)*p**k*(1-p)**(n-k)

class P:
    __slots__=('id','role','alive','verified','room','susp')
    def __init__(s,i,role): s.id=i; s.role=role; s.alive=True; s.verified=False; s.room=None; s.susp=0.0

def play(n_players, rng, sigma=1.0, alien_style='corrupt', forget=0.05, assign='volunteer', cfg=CFG, cautious=False, alien_rule='spec', guard=False):
    """sigma: crew perception noise (0 = perfect Bayesian table, big = random voting)
       alien_style: 'corrupt' | 'break' | 'mixed'
       forget: chance the table fails to send a fixer to a broken room in a round
       assign: 'volunteer' (aliens get into medbay) | 'random' (table assigns slots at random)"""
    na = aliens_for(n_players) if alien_rule=='spec' else (1 if n_players<=5 else 2 if n_players<=9 else 3)
    roles = ['MIMIC']*na + ['CREW']*(n_players-na); rng.shuffle(roles)
    ps = [P(i,r) for i,r in enumerate(roles)]
    rooms = {r: dict(broken=False, fuse=None) for r in ROOMS}
    scrap, cells, prog, xray = cfg['startScrap'], cfg['startCells'], 0, False
    stats = dict(xray_round=None, scans=0, breaks=0, corrupts=0, steals=0)
    alive = lambda: [p for p in ps if p.alive]
    aliens_alive = lambda: [p for p in ps if p.alive and p.role=='MIMIC']

    for rnd in range(1, cfg['rounds']+1):
        # ---- REPORT: fuses tick, win check
        for r in ROOMS:
            if rooms[r]['broken']:
                rooms[r]['fuse'] -= 1
                if rooms[r]['fuse'] <= 0:
                    return 'MIMIC','HULL_BREACH',rnd,stats
        living = alive()
        N = len(living)

        # ---- ACT: the table agrees a plan out loud; everyone follows it publicly
        plan = {}
        pool = living[:]
        rng.shuffle(pool)
        for r in ROOMS:
            if rooms[r]['broken'] and pool and rng.random() >= forget:
                plan[pool.pop().id] = r
        rest = len(pool)
        if not xray:
            r_workers = 1 if cells < cfg['scanCost'] and rest > 2 else 0
            avail = rest - r_workers
            best = None
            for c in range(0, avail+1):
                m = avail - c
                if m*cfg['repairCost'] <= scrap + cfg['scrapPer']*c:
                    best = (m, c); break
            m, c = best if best else (0, avail)
            need_attempts = math.ceil((cfg['repairTarget']-prog)/cfg['p'])
            m2 = min(m, max(need_attempts, 1), cfg['medbayCap'])
            r_workers += (m - m2); m = m2
            slots = ['medbay']*m + ['cargo']*c + ['reactor']*r_workers
            if assign == 'volunteer':
                al = [p for p in pool if p.role=='MIMIC']; cr = [p for p in pool if p.role=='CREW']
                order = al + cr
            elif assign == 'hide':
                al = [p for p in pool if p.role=='MIMIC']; cr = [p for p in pool if p.role=='CREW']
                order = cr + al
            elif assign == 'smart':
                # aliens volunteer for medbay only when it is crowded (3+ slots), else hide in cargo/reactor
                al = [p for p in pool if p.role=='MIMIC']; cr = [p for p in pool if p.role=='CREW']
                order = (al + cr) if m >= 3 else (cr + al)
            else:
                order = pool
            for p, s in zip(order, slots): plan[p.id] = s
        elif guard:
            # post-xray: staff the reactor only up to the cap, verified players first; everyone else waits in cargo
            k = min(len(pool), max(1, cfg['reactorCap'] if cfg['reactorCap']<99 else len(pool)))
            order = sorted(pool, key=lambda p: (not p.verified, rng.random()))
            for i,p in enumerate(order): plan[p.id] = 'reactor' if i < k else 'cargo'
        else:
            for p in pool: plan[p.id] = 'reactor'

        workers = defaultdict(list)
        for p in living:
            p.room = plan.get(p.id, 'cargo')
            workers[p.room].append(p)

        # alien intents -> team picks one
        cand = []
        for a in aliens_alive():
            room = a.room
            legal_breaks = [t for t in ({room}|ADJ[room]) if t in BREAKABLE and not rooms[t]['broken']]
            empty_breaks = [t for t in legal_breaks if not workers[t]]
            opts = []
            if room=='medbay' and not xray and (scrap + cfg['scrapPer']*len(workers['cargo'])) >= 1:
                opts.append(('CORRUPT',None,None))
            if cautious:
                legal_breaks = [t for t in legal_breaks if sum(len(workers[x]) for x in ({t}|ADJ[t]))>=3]
                empty_breaks = [t for t in legal_breaks if not workers[t]]
                if opts and rng.random()<0.5: opts = []   # skip corrupt half the time to blend in
            if legal_breaks: opts.append(('BREAK', rng.choice(empty_breaks or legal_breaks), None))
            if room=='cargo' and scrap>=1 and not xray: opts.append(('STEAL',None,'scrap'))
            if room=='reactor' and cells>=1: opts.append(('STEAL',None,'cells'))
            if not opts: continue
            style = alien_style if alien_style!='mixed' else rng.choice(['corrupt','break'])
            pref = ['CORRUPT','BREAK','STEAL'] if style=='corrupt' else ['BREAK','CORRUPT','STEAL']
            opts.sort(key=lambda o: pref.index(o[0]))
            cand.append((a, opts[0]))
        if cfg.get('independent'):
            chosen_list = cand[:]            # every Mimic's sabotage lands
        else:
            chosen_list = [rng.choice(cand)] if cand else []   # one per team per round

        # ---- RESOLVE
        corrupted = 0
        events = []   # (kind, room) for the crew's public reasoning
        for a,(kind,target,res) in chosen_list:
            if kind=='BREAK':
                if rooms[target]['broken']: continue
                rooms[target]['broken']=True; rooms[target]['fuse']=cfg['fuse']; stats['breaks']+=1; events.append(('BREAK',target))
            elif kind=='CORRUPT':
                corrupted+=1; stats['corrupts']+=1
            elif kind=='STEAL':
                stats['steals']+=1; events.append(('STEAL',a.room))
                if res=='scrap': scrap=max(0,scrap-2)
                else: cells=max(0,cells-2)
        prod = {r: list(workers[r]) for r in ROOMS}
        for r in ROOMS:
            if rooms[r]['broken'] and prod[r]:
                rooms[r]['broken']=False; rooms[r]['fuse']=None
                prod[r].remove(rng.choice(prod[r]))
        cells += min(cfg['reactorCap'], cfg['cellsPer']*len(prod['reactor']))
        scrap += cfg['scrapPer']*len(prod['cargo'])
        scrap_before = scrap; prog_before = prog
        for _ in range(min(len(prod['medbay']), cfg['medbayCap'])):
            if scrap < cfg['repairCost']: continue
            scrap -= cfg['repairCost']
            if corrupted>0: corrupted-=1; continue
            if rng.random() < cfg['p']: prog = min(cfg['repairTarget'], prog+1)
        if prog >= cfg['repairTarget'] and not xray:
            xray=True; stats['xray_round']=rnd

        # ---- crew reasoning from the PUBLIC report only
        attempts = scrap_before - scrap; succ = prog - prog_before
        if attempts >= 1 and workers['medbay']:
            pc = binom(attempts, succ, cfg['p']); pk = binom(attempts-1, succ, cfg['p'])
            lr = (pk+1e-9)/(pc+1e-9)
            d = max(-3.0, min(3.0, math.log(lr)))
            for p in workers['medbay']: p.susp += d
        for kind, sab_room in events:
            if kind=='BREAK':
                c = [p for p in living if p.room==sab_room or p.room in ADJ[sab_room]]
            else:
                c = [p for p in living if p.room==sab_room]
            if c:
                d = math.log(N/len(c))
                for p in c: p.susp += d

        # ---- VOTE
        if xray and cells >= cfg['scanCost'] and len(alive())>=2:
            living = alive()
            elig = [p for p in living if not p.verified]
            def crew_pick(voter, cands):
                cs = [c for c in cands if c is not voter] or cands
                return max(cs, key=lambda c: c.susp + rng.gauss(0, sigma))
            def alien_pick(voter, cands):
                crew_c = [c for c in cands if c.role=='CREW']
                if not crew_c: return rng.choice([c for c in cands if c is not voter] or cands)
                return max(crew_c, key=lambda c: c.susp + rng.gauss(0, 0.3))
            def ballot(cands, runoff=False):
                votes = Counter()
                for v in living:
                    cs = cands
                    if runoff and v in cands: cs = [c for c in cands if c is not v]
                    votes[(crew_pick if v.role=='CREW' else alien_pick)(v, cs).id] += 1
                top = max(votes.values()); tied = [i for i,c in votes.items() if c==top]
                return tied
            tied = ballot(elig)
            target = None
            if len(tied)==1: target = ps[tied[0]]
            else:
                tied2 = ballot([ps[i] for i in tied], runoff=True)
                if len(tied2)==1: target = ps[tied2[0]]
            if target:
                cells -= cfg['scanCost']; stats['scans']+=1
                if target.role=='MIMIC':
                    target.alive=False
                    if not aliens_alive(): return 'CREW','ALL_MIMICS_FOUND',rnd,stats
                else:
                    target.verified=True
    return 'MIMIC','REACHED_THE_RELAY',cfg['rounds'],stats

def run(n_games, seed=1, **kw):
    rng = random.Random(seed)
    res = Counter(); reasons = Counter(); xr=[]; scans=[]
    for _ in range(n_games):
        w, why, rnd, st = play(rng=rng, **kw)
        res[w]+=1; reasons[why]+=1
        if st['xray_round']: xr.append(st['xray_round'])
        scans.append(st['scans'])
    crew = 100*res['CREW']/n_games
    return dict(crew=crew, reasons=dict(reasons), xray=(sum(xr)/len(xr) if xr else 0), online=100*len(xr)/n_games, scans=sum(scans)/n_games)

if __name__=='__main__':
    print("=== 8 players (2 aliens), sample-size effect. Crew skill sigma=1.0, alien style corrupt ===")
    for n in (10,20,50,5000):
        r = run(n, seed=7, n_players=8, sigma=1.0)
        print(f"  {n:>5} games: crew {r['crew']:5.1f}%   {r['reasons']}")
    print()
    print("=== 8 players (2 aliens), 5000 games each. Rows = crew skill, cols = alien style ===")
    print(f"  {'crew skill':<28}" + "".join(f"{s:>12}" for s in ('corrupt','break','mixed')))
    for label,sig in (('perfect table (sigma 0)',0.0),('sharp table (sigma 1)',1.0),('average table (sigma 2)',2.0),('loose table (sigma 4)',4.0),('random votes (sigma 50)',50.0)):
        row=[]
        for st in ('corrupt','break','mixed'):
            r = run(5000, seed=11, n_players=8, sigma=sig, alien_style=st); row.append(r)
        print(f"  {label:<28}" + "".join(f"{r['crew']:>11.1f}%" for r in row) + f"   | xray online rnd {row[0]['xray']:.1f} ({row[0]['online']:.0f}% of games), {row[0]['scans']:.1f} scans/game")
    print()
    print("=== Player count, sharp table (sigma 1), alien style corrupt, 5000 games ===")
    for n in (5,6,7,8,9,10,12):
        r = run(5000, seed=13, n_players=n, sigma=1.0)
        print(f"  {n:>2} players ({aliens_for(n)} alien): crew {r['crew']:5.1f}%  xray rnd {r['xray']:.1f} ({r['online']:.0f}% online)  scans {r['scans']:.1f}  {r['reasons']}")
    print()
    print("=== Levers, 8 players, sigma 1, corrupt aliens, 5000 games ===")
    base = dict(n_players=8, sigma=1.0)
    print(f"  baseline                         crew {run(5000, seed=17, **base)['crew']:.1f}%")
    print(f"  table assigns medbay at random   crew {run(5000, seed=17, assign='random', **base)['crew']:.1f}%")
    r = run(5000, seed=17, forget=0.25, **base)
    print(f"  careless table (forget 25%)      crew {r['crew']:.1f}%  {r['reasons']}")
    for tgt in (5,7,8):
        c = dict(CFG); c['repairTarget']=tgt
        print(f"  repair track {tgt}                   crew {run(5000, seed=17, cfg=c, **base)['crew']:.1f}%")
    for rr in (8,12):
        c = dict(CFG); c['rounds']=rr
        print(f"  {rr} rounds                        crew {run(5000, seed=17, cfg=c, **base)['crew']:.1f}%")
    c = dict(CFG); c['p']=0.7
    print(f"  repair chance 70%                crew {run(5000, seed=17, cfg=c, **base)['crew']:.1f}%")
    c = dict(CFG); c['scanCost']=3
    print(f"  scan cost 3 cells                crew {run(5000, seed=17, cfg=c, **base)['crew']:.1f}%")
