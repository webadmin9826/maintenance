const clientPromise = require('../../lib/mongo');
const { ObjectId } = require('mongodb');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const { id } = req.query || {};
    if (!id) return res.status(400).end(JSON.stringify({ error: 'Missing id' }));

    const client = await clientPromise;                    // catch env/connection errors
    const db = client.db(process.env.DB_NAME || 'ticketingDB');
    const Tickets = db.collection('tickets');

    if (req.method === 'PATCH') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body || '{}'); }
        catch { return res.status(400).end(JSON.stringify({ error: 'Invalid JSON body' })); }
      }
      const { status } = body || {};
      if (!['Open', 'Completed'].includes(status)) {
        return res.status(400).end(JSON.stringify({ error: 'Invalid status' }));
      }
      const set = { status };
      if (status === 'Completed') set.completedAt = new Date().toISOString();
      if (status === 'Open') set.completedAt = null;

      const r = await Tickets.updateOne({ _id: new ObjectId(id) }, { $set: set });
      if (r.matchedCount === 0) return res.status(404).end(JSON.stringify({ error: 'Ticket not found' }));
      return res.status(200).end(JSON.stringify({ ok: true }));
    }

    if (req.method === 'DELETE') {
      const r = await Tickets.deleteOne({ _id: new ObjectId(id) });
      if (r.deletedCount === 0) return res.status(404).end(JSON.stringify({ error: 'Ticket not found' }));
      return res.status(200).end(JSON.stringify({ ok: true }));
    }

    res.setHeader('Allow', 'PATCH, DELETE');
    return res.status(405).end(JSON.stringify({ error: 'Method Not Allowed' }));
  } catch (e) {
    return res.status(500).end(JSON.stringify({ error: e.message || String(e) }));
  }
};
