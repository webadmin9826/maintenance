const clientPromise = require('../../lib/mongo');

module.exports = async (req, res) => {
  res.setHeader('Content-Type','application/json');
  try {
    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'RegistrarDB');
    const Tickets = db.collection('ticket');

    if (req.method === 'POST') {
      let doc = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (!doc.studentName || !doc.requestType || !doc.dateReceived) return res.status(400).end(JSON.stringify({error:'Missing fields'}));
      doc.createdAt = new Date().toISOString();
      doc.processingDays = doc.dateRelease ? Math.max(0, (new Date(doc.dateRelease)-new Date(doc.dateReceived))/(1000*60*60*24)) : null;
      const r = await Tickets.insertOne(doc);
      return res.status(201).end(JSON.stringify({ _id: String(r.insertedId), ref: doc.ref || null }));
    }

    if (req.method === 'GET') {
      const { q, status, from, to, limit } = req.query || {};
      const filter = {};
      if (status) filter.status = status;
      if (from || to) {
        filter.dateReceived = {};
        if (from) filter.dateReceived.$gte = new Date(from);
        if (to) filter.dateReceived.$lte = new Date(new Date(to).getTime()+24*60*60*1000-1);
      }
      if (q) {
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),'i');
        filter.$or = [
          { studentId: rx }, { studentName: rx }, { requestType: rx }, { remarks: rx }
        ];
      }
      const lim = Math.min(Math.max(parseInt(limit || '300',10),1),1000);
      const rows = await Tickets.find(filter).sort({ dateReceived: -1 }).limit(lim).toArray();
      rows.forEach(r=>r._id=String(r._id));
      return res.status(200).end(JSON.stringify(rows));
    }

    res.setHeader('Allow','GET, POST');
    return res.status(405).end(JSON.stringify({ error:'Method Not Allowed' }));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ error: e.message || String(e) }));
  }
};
