const clientPromise = require('../../lib/mongo');
const { computeProcessingAndTimeliness } = require('./_helper');

module.exports = async (req, res) => {
  res.setHeader('Content-Type','application/json');
  try {
    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'RegistrarDB');
    const Tickets = db.collection('ticket');

    if (req.method === 'POST') {
      let payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      // ---- Bulk insert: accept an array of documents ----
      if (Array.isArray(payload)) {
        if (!payload.length) return res.status(400).end(JSON.stringify({ error: 'Empty array' }));
        const docs = payload.map(d => {
          const doc = { ...d, createdAt: new Date().toISOString() };
          const calc = computeProcessingAndTimeliness(doc);
          doc.processingDays = calc.processingDays;
          doc.timeliness = calc.timeliness;
          return doc;
        });
        const r = await Tickets.insertMany(docs, { ordered: false });
        return res.status(201).end(JSON.stringify({ ok: true, insertedCount: r.insertedCount }));
      }

      // ---- Single insert ----
      const doc = payload;
      if (!doc.studentName || !doc.requestType || !doc.dateReceived) {
        return res.status(400).end(JSON.stringify({ error: 'Missing fields' }));
      }
      doc.createdAt = new Date().toISOString();
      const calc = computeProcessingAndTimeliness(doc);
      doc.processingDays = calc.processingDays;
      doc.timeliness = calc.timeliness;
      const r = await Tickets.insertOne(doc);
      return res.status(201).end(JSON.stringify({ _id: String(r.insertedId), ref: doc.ref || null }));
    }

    if (req.method === 'GET') {
      const query = req.query || {};
      const { q, status, from, to, limit } = query;

      const filter = {};
      if (status) filter.status = status;
      if (from || to) {
        filter.dateReceived = {};
        if (from) filter.dateReceived.$gte = new Date(from);
        if (to) filter.dateReceived.$lte = new Date(new Date(to).getTime() + 24*60*60*1000 - 1);
      }
      if (q) {
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [
          { studentId: rx }, { studentName: rx }, { requestType: rx }, { remarks: rx }, { staff: rx }
        ];
      }

      // No default limit. Only apply a limit if caller provided one.
      let cursor = Tickets.find(filter).sort({ dateReceived: -1 });
      const lim = parseInt(limit, 10);
      if (Number.isFinite(lim) && lim > 0) cursor = cursor.limit(lim);

      const rows = await cursor.toArray();
      rows.forEach(r => { r._id = String(r._id); });
      return res.status(200).end(JSON.stringify(rows));
    }

    res.setHeader('Allow','GET, POST');
    return res.status(405).end(JSON.stringify({ error: 'Method Not Allowed' }));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ error: e.message || String(e) }));
  }
};
