// api/ticket/index.js
const clientPromise = require('../../lib/mongo');
const { computeProcessingAndTimeliness } = require('./_helper');

// Build MMDDYYYYHHmm from an ISO string using UTC parts to preserve the
// original wall-clock entered by the user (datetime-local -> toISOString()).
function pad2(n){ return String(n).padStart(2,'0'); }
function compactDateFromISO(zIso){
  const d = new Date(zIso || Date.now());
  const MM = pad2(d.getUTCMonth()+1);
  const DD = pad2(d.getUTCDate());
  const YYYY = d.getUTCFullYear();
  const HH = pad2(d.getUTCHours());
  const mm = pad2(d.getUTCMinutes());
  return `${MM}${DD}${YYYY}${HH}${mm}`;
}

// Derive initials: Given, Middle (first token only, optional), Last (initial)
function initialsFromName(name){
  if (!name || typeof name !== 'string') return 'X';
  const raw = name.trim().replace(/\s+/g,' ');
  if (!raw) return 'X';
  const parts = raw.split(' ');
  if (parts.length === 1) return parts[0][0].toUpperCase();
  const first = parts[0][0] || '';
  const last  = parts[parts.length - 1][0] || '';
  // middle = first token after given if there are >=3 tokens
  const middle = parts.length >= 3 ? (parts[1][0] || '') : '';
  return (first + middle + last).toUpperCase();
}

// Build ticket ref: MMDDYYYYHHmm + initials (e.g., 011020250804AVL)
function buildRef(dateReceivedISO, studentName){
  const stamp = compactDateFromISO(dateReceivedISO);
  const ini = initialsFromName(studentName);
  return `${stamp}${ini}`;
}

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'RegistrarDB');
    const Tickets = db.collection('ticket');

    if (req.method === 'POST') {
      let payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      // ---------- BULK INSERT ----------
      if (Array.isArray(payload)) {
        if (!payload.length) return json(res, 400, { error: 'Empty array' });

        const docs = payload.map(d => {
          const doc = { ...d };
          // Ensure dateReceived exists (required by your UI, but guard anyway)
          if (!doc.dateReceived) doc.dateReceived = new Date().toISOString();

          // Generate ref only if missing
          if (!doc.ref) {
            doc.ref = buildRef(doc.dateReceived, doc.studentName || doc.requester || '');
          }

          doc.createdAt = new Date().toISOString();

          const calc = computeProcessingAndTimeliness(doc);
          doc.processingDays = calc.processingDays;
          doc.timeliness = calc.timeliness;
          return doc;
        });

        const r = await Tickets.insertMany(docs, { ordered: false });
        return json(res, 201, { ok: true, insertedCount: r.insertedCount });
      }

      // ---------- SINGLE INSERT ----------
      const doc = payload;
      if (!doc.studentName || !doc.requestType || !doc.dateReceived) {
        return json(res, 400, { error: 'Missing fields' });
      }

      // Generate compact ref if not provided
      if (!doc.ref) {
        doc.ref = buildRef(doc.dateReceived, doc.studentName || '');
      }

      doc.createdAt = new Date().toISOString();

      const calc = computeProcessingAndTimeliness(doc);
      doc.processingDays = calc.processingDays;
      doc.timeliness = calc.timeliness;

      const r = await Tickets.insertOne(doc);
      return json(res, 201, { _id: String(r.insertedId), ref: doc.ref });
    }

    if (req.method === 'GET') {
      const query = req.query || {};
      const { q, status, from, to, limit } = query;

      const filter = {};
      if (status) filter.status = status;
      if (from || to) {
        filter.dateReceived = {};
        if (from) filter.dateReceived.$gte = new Date(from);
        if (to)   filter.dateReceived.$lte = new Date(new Date(to).getTime() + 24*60*60*1000 - 1);
      }
      if (q) {
        const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [
          { ref: rx }, { studentId: rx }, { studentName: rx }, { requestType: rx }, { remarks: rx }, { staff: rx }
        ];
      }

      let cursor = Tickets.find(filter).sort({ dateReceived: -1 });
      const lim = parseInt(limit, 10);
      if (Number.isFinite(lim) && lim > 0) cursor = cursor.limit(lim);

      const rows = await cursor.toArray();
      rows.forEach(r => r._id = String(r._id));
      return json(res, 200, rows);
    }

    res.setHeader('Allow','GET, POST');
    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (e) {
    return json(res, 500, { error: e.message || String(e) });
  }
};
