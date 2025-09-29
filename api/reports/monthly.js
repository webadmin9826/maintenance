const clientPromise = require('../../lib/mongo');

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
    const groups = new Map(); // key YYYY-MM
    for (const r of rows) {
      const d = new Date(r.dateReceived || r.createdAt || new Date());
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }

    const out = [];
    for (const [key, items] of groups.entries()) {
      const completed = items.filter(i => i.status === 'Released' || i.dateRelease);
      const proc = completed.map(i => i.processingDays ?? ((i.dateRelease && i.dateReceived)? ((new Date(i.dateRelease)-new Date(i.dateReceived))/(1000*60*60*24)) : null)).filter(v => v!=null);
      const target = items.map(i => i.targetDays).filter(v => typeof v === 'number');
      out.push({
        month: key, completed: completed.length,
        actualAvg: proc.length? (proc.reduce((a,b)=>a+b,0)/proc.length) : null,
        targetAvg: target.length? (target.reduce((a,b)=>a+b,0)/target.length) : null
      });
    }
    out.sort((a,b)=> a.month.localeCompare(b.month));
    res.setHeader('Content-Type','application/json');
    return res.status(200).end(JSON.stringify(out));
  } catch (e) {
    return res.status(500).end(e.message || String(e));
  }
};
