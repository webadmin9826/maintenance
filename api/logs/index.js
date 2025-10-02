// /api/logs/index.js
const clientPromise = require('../../lib/mongo');

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}
function todayISO(d=new Date()){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}
function timeHHMMSS(d=new Date()){
  const h=String(d.getHours()).padStart(2,'0'), mi=String(d.getMinutes()).padStart(2,'0'), s=String(d.getSeconds()).padStart(2,'0');
  return `${h}:${mi}:${s}`;
}

module.exports = async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'LibrabryLog'); // keep your requested name
    const Col = db.collection('timecapture');

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const name = (body.name||'').trim();
      const yearLevel = (body.yearLevel||'').trim();
      const purpose = (body.purpose||'').trim();
      const extra = (body.extra||'').trim();
      const via = (body.via||'manual').trim().toLowerCase();

      if (!name || !yearLevel || !purpose) {
        return json(res, 400, { error: 'Missing name, yearLevel, or purpose' });
      }

      const now = new Date();
      const doc = {
        date: body.date || todayISO(now),
        timeIn: body.timeIn || timeHHMMSS(now),
        name, yearLevel, purpose,
        extra: extra || null,
        via: via === 'qr' ? 'qr' : 'manual',
        createdAt: new Date().toISOString()
      };

      const r = await Col.insertOne(doc);
      return json(res, 201, { ok: true, _id: String(r.insertedId) });
    }

    if (req.method === 'GET') {
      const q = req.query || {};
      const search = (q.q || '').trim();
      const from = (q.from || '').trim();
      const to   = (q.to   || '').trim();
      const page = Math.max(1, parseInt(q.page||'1',10) || 1);
      const pageSize = Math.max(0, parseInt(q.pageSize||'0',10) || 0); // 0 = no limit
      const exportAll = q.limit === '0' || q.export === '1';

      const filter = {};
      if (from || to) {
        filter.date = {};
        if (from) filter.date.$gte = from;
        if (to)   filter.date.$lte = to;
      }
      if (search) {
        const rx = new RegExp(search.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'i');
        filter.$or = [
          { name: rx }, { yearLevel: rx }, { purpose: rx }, { extra: rx }, { via: rx }
        ];
      }

      let cursor = Col.find(filter).sort({ createdAt: -1 });
      const total = await cursor.count();

      if (!exportAll && pageSize > 0) {
        cursor = cursor.skip((page-1)*pageSize).limit(pageSize);
      }
      const rows = await cursor.toArray();
      rows.forEach(r => r._id = String(r._id));
      return json(res, 200, { rows, total, page, pageSize: pageSize||total });
    }

    res.setHeader('Allow','GET, POST');
    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (e) {
    return json(res, 500, { error: e.message || String(e) });
  }
};
