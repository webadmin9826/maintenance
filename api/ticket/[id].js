const clientPromise = require('../../lib/mongo');
const { ObjectId } = require('mongodb');

module.exports = async (req, res) => {
  res.setHeader('Content-Type','application/json');
  try {
    let id = (req.query && (req.query.id || req.query[0])) || '';
    if (!id && req.url) {
      try { const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
            const parts = url.pathname.split('/').filter(Boolean);
            id = parts[parts.length-1] || ''; } catch {}
    }
    if (!id) return res.status(400).end(JSON.stringify({ error: 'Missing id' }));

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'RegistrarDB');
    const Tickets = db.collection('ticket');

    if (req.method === 'PATCH') {
      let body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const set = {};
      if (body.status) set.status = body.status;
      if (body.targetDays !== undefined) set.targetDays = body.targetDays;
      if (body.remarks !== undefined) set.remarks = body.remarks;
      if (body.dateRelease !== undefined) set.dateRelease = body.dateRelease;
      if (set.dateRelease || set.status) {
        const doc = await Tickets.findOne({ _id: new ObjectId(id) });
        const dr = (set.dateRelease !== undefined ? set.dateRelease : (doc? doc.dateRelease : null));
        const recv = doc ? doc.dateReceived : null;
        if (dr && recv) set.processingDays = Math.max(0,(new Date(dr)-new Date(recv))/(1000*60*60*24));
      }
      const r = await Tickets.updateOne({ _id: new ObjectId(id) }, { $set: set });
      if (!r.matchedCount) return res.status(404).end(JSON.stringify({ error: 'Not found' }));
      return res.status(200).end(JSON.stringify({ ok: true }));
    }

    if (req.method === 'DELETE') {
      const r = await Tickets.deleteOne({ _id: new ObjectId(id) });
      if (!r.deletedCount) return res.status(404).end(JSON.stringify({ error: 'Not found' }));
      return res.status(200).end(JSON.stringify({ ok: true }));
    }

    res.setHeader('Allow','PATCH, DELETE');
    return res.status(405).end(JSON.stringify({ error: 'Method Not Allowed' }));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ error: e.message || String(e) }));
  }
};
