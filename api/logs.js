// /api/logs.js
// Vercel/Next serverless: GET with filters and POST insert
const { MongoClient } = require('mongodb');

let _client;
async function getClient() {
  if (_client) return _client;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Missing MONGODB_URI');
  _client = new MongoClient(uri, { maxPoolSize: 10 });
  await _client.connect();
  return _client;
}

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

function rx(val) {
  try { return new RegExp(String(val).trim(), 'i'); } catch { return null; }
}

module.exports = async (req, res) => {
  try {
    const client = await getClient();
    // Use your provided DB/collection names
    const dbName = process.env.LIB_DB_NAME || 'LibrabryLog'; // <- as you specified
    const db = client.db(dbName);
    const col = db.collection('timecapture');

    if (req.method === 'GET') {
      const { q, purpose, course } = req.query || {};
      const filter = {};

      // exact filters when provided
      if (purpose && String(purpose).trim()) filter.purpose = String(purpose).trim();
      if (course && String(course).trim()) filter.course = String(course).trim();

      // free-text $or
      if (q && String(q).trim()) {
        const r = rx(q);
        if (r) {
          filter.$or = [
            { name: r },
            { purpose: r },
            { extra: r },
            { yearLevel: r },
            { course: r }
          ];
        }
      }

      const docs = await col.find(filter).sort({ _id: -1 }).toArray(); // no limit
      return json(res, 200, docs);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      // Minimal validation
      const required = ['date', 'timeIn', 'name', 'yearLevel', 'course', 'purpose'];
      const missing = required.filter(k => !body[k] || String(body[k]).trim() === '');
      if (missing.length) {
        return json(res, 400, { error: 'Missing required fields: ' + missing.join(', ') });
      }

      const doc = {
        date: String(body.date),
        timeIn: String(body.timeIn),
        name: String(body.name),
        yearLevel: String(body.yearLevel),
        course: String(body.course),
        purpose: String(body.purpose),
        extra: body.extra ? String(body.extra) : '',
        via: body.via ? String(body.via) : 'manual',
        createdAt: new Date().toISOString()
      };

      const r = await col.insertOne(doc);
      return json(res, 200, { ok: true, _id: r.insertedId.toString() });
    }

    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (e) {
    return json(res, 500, { error: e.message || String(e) });
  }
};
