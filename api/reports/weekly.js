const clientPromise = require('../../lib/mongo');

function weekStart(d){ const dt = new Date(d); const day = dt.getDay(); const diff = dt.getDate() - day + (day===0?-6:1);
  const s = new Date(dt.setDate(diff)); s.setHours(0,0,0,0); return s; }
function weekEnd(s){ const e = new Date(s); e.setDate(e.getDate()+6); e.setHours(23,59,59,999); return e; }

module.exports = async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'RegistrarDB');
    const Tickets = db.collection('ticket');

    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;

    const filter = {};
    if (from || to) {
      filter.dateReceived = {};
      if (from) filter.dateReceived.$gte = from;
      if (to) { const end = new Date(to); end.setHours(23,59,59,999); filter.dateReceived.$lte = end; }
    }

    const rows = await Tickets.find(filter).toArray();

    const groups = new Map();
    for (const r of rows) {
      const s = weekStart(r.dateReceived || r.createdAt || new Date());
      const key = s.toISOString().slice(0,10);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }

    const out = [];
    for (const [key, items] of groups.entries()) {
      const s = new Date(key), e = weekEnd(s);
      const completed = items.filter(i => i.status === 'Released' || i.dateRelease);
      const proc = completed.map(i => i.processingDays ?? ((i.dateRelease && i.dateReceived) ? ((new Date(i.dateRelease)-new Date(i.dateReceived))/(1000*60*60*24)) : null)).filter(v => v!=null);
      const target = items.map(i => i.targetDays).filter(v => typeof v === 'number');
      const fastest = proc.length? Math.min(...proc) : null;
      const longest = proc.length? Math.max(...proc) : null;
      const within = completed.filter(i => typeof i.targetDays==='number' && (i.processingDays ?? 1e9) <= i.targetDays);
      out.push({
        week: `Wk of ${s.toISOString().slice(0,10)}`, start: s, end: e,
        total: items.length, completed: completed.length,
        avg: proc.length? (proc.reduce((a,b)=>a+b,0)/proc.length) : null,
        targetAvg: target.length? (target.reduce((a,b)=>a+b,0)/target.length): null,
        fastest, longest,
        pctWithin: completed.length? (within.length*100/completed.length): null
      });
    }

    out.sort((a,b)=> new Date(a.start)-new Date(b.start));
    res.setHeader('Content-Type','application/json');
    return res.status(200).end(JSON.stringify(out));
  } catch (e) {
    return res.status(500).end(e.message || String(e));
  }
};
