const clientPromise = require('../../lib/mongo');
const { ObjectId } = require('mongodb');
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    let id = (req.query && (req.query.id || req.query[0])) || '';
    if (!id && req.url) { try { const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); const parts = url.pathname.split('/').filter(Boolean); id = parts[parts.length - 1] || ''; } catch {} }
    if (!id) return res.status(400).end(JSON.stringify({ error: 'Missing id' }));
    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'ticketingDB');
    const Col = db.collection('classroomticket');
    if (req.method === 'PATCH') {
      let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch { return res.status(400).end(JSON.stringify({ error: 'Invalid JSON body' })); } }
      const { status } = body || {}; if (!['Open','Completed'].includes(status)) return res.status(400).end(JSON.stringify({ error: 'Invalid status' }));
      const set = { status }; if (status === 'Completed') set.completedAt = new Date().toISOString(); if (status === 'Open') set.completedAt = null;
      const r = await Col.updateOne({ _id: new ObjectId(id) }, { $set: set }); if (r.matchedCount === 0) return res.status(404).end(JSON.stringify({ error: 'Ticket not found' }));
      return res.status(200).end(JSON.stringify({ ok: true }));
    }
    if (req.method === 'DELETE') {
      const r = await Col.deleteOne({ _id: new ObjectId(id) }); if (r.deletedCount === 0) return res.status(404).end(JSON.stringify({ error: 'Ticket not found' }));
      return res.status(200).end(JSON.stringify({ ok: true }));
    }
    res.setHeader('Allow', 'PATCH, DELETE'); return res.status(405).end(JSON.stringify({ error: 'Method Not Allowed' }));
  } catch (e) { return res.status(500).end(JSON.stringify({ error: e.message || String(e) })); }
};