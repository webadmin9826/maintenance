const clientPromise = require('../../lib/mongo');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'ticketingDB');
    const Tickets = db.collection('tickets');

    if (req.method === 'POST') {
      let doc = req.body;
      if (typeof doc === 'string') {
        try { doc = JSON.parse(doc || '{}'); } catch { return res.status(400).end(JSON.stringify({ error: 'Invalid JSON body' })); }
      }
      doc = doc || {};
      if (!doc.requester || !doc.department || !doc.description || !doc.urgency) {
        return res.status(400).end(JSON.stringify({ error: 'All fields are required.' }));
      }
      const r = await Tickets.insertOne(doc);
      return res.status(201).end(JSON.stringify({ _id: String(r.insertedId), ticketId: doc.ticketId }));
    }

    if (req.method === 'GET') {
      const { q, status, urgency, limit } = req.query || {};
      const filter = {};
      if (status) filter.status = status;
      if (urgency) filter.urgency = urgency;
      if (q) {
        const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(esc, 'i');
        filter.$or = [{ requester: rx }, { department: rx }, { description: rx }, { ticketId: rx }];
      }
      const lim = Math.min(Math.max(parseInt(limit || '200', 10), 1), 1000);
      const rows = await Tickets.find(filter).sort({ createdAt: -1 }).limit(lim).toArray();
      rows.forEach(r => r._id = String(r._id));
      return res.status(200).end(JSON.stringify(rows));
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end(JSON.stringify({ error: 'Method Not Allowed' }));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ error: e.message || String(e) }));
  }
};

const clientPromise = require('../../lib/mongo');
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'ticketingDB');
    const Col = db.collection('classroomticket');
    if (req.method === 'POST') {
      let doc = req.body; if (typeof doc === 'string') { try { doc = JSON.parse(doc || '{}'); } catch { return res.status(400).end(JSON.stringify({ error: 'Invalid JSON body' })); } }
      doc = doc || {};
      const required = ['department','requester','particulars','location','description'];
      for (const k of required) { if (!doc[k] || String(doc[k]).trim() === '') return res.status(400).end(JSON.stringify({ error: `Missing required field: ${k}` })); }
      const nowIso = new Date().toISOString();
      doc.dateFiled = doc.dateFiled || nowIso; doc.createdAt = doc.createdAt || nowIso; doc.status = doc.status || 'Open'; doc.completedAt = doc.completedAt || null;
      const r = await Col.insertOne(doc);
      return res.status(201).end(JSON.stringify({ _id: String(r.insertedId), reference: doc.reference || null }));
    }
    if (req.method === 'GET') {
      const { q, status, limit } = req.query || {}; const filter = {};
      if (status) filter.status = status;
      if (q) { const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const rx = new RegExp(esc, 'i'); filter.$or = [{ requester: rx }, { department: rx }, { particulars: rx }, { location: rx }, { description: rx }, { reference: rx }]; }
      const lim = Math.min(Math.max(parseInt(limit || '200', 10), 1), 1000);
      const rows = await Col.find(filter).sort({ dateFiled: -1 }).limit(lim).toArray(); rows.forEach(r => r._id = String(r._id));
      return res.status(200).end(JSON.stringify(rows));
    }
    res.setHeader('Allow', 'GET, POST'); return res.status(405).end(JSON.stringify({ error: 'Method Not Allowed' }));
  } catch (e) { return res.status(500).end(JSON.stringify({ error: e.message || String(e) })); }
};
