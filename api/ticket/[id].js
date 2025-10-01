// /api/ticket/[id].js
// Unified router for both Registrar tickets and Library logs.
// Paths:
//   /api/ticket/logs      → Library logs (GET with filters, POST insert)
//   /api/ticket/list      → Registrar list (GET with filters; returns ALL)
//   /api/ticket/new       → Registrar create (POST)
//   /api/ticket/<ObjectId>→ Registrar update (PATCH), delete (DELETE)

const { ObjectId } = require('mongodb');
const clientPromise = require('../../lib/mongo');
const { computeProcessingAndTimeliness } = require('./_helper');

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

function rx(val) {
  try { return new RegExp(String(val).trim(), 'i'); } catch { return null; }
}

// best-effort date → ISO, or passthrough if not parseable
function toISOorNull(v) {
  if (v === null) return null;
  if (v === undefined || v === '') return undefined;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : v;
}

function getIdFromReq(req) {
  const q = req.query || {};
  let id = q.id;
  if (Array.isArray(id)) id = id[0];
  if (!id && req.url) {
    const m = req.url.match(/\/api\/ticket\/([^/?#]+)(?:[/?#]|$)/i);
    if (m) id = m[1];
  }
  return (id || '').toLowerCase();
}

/* ----- Registrar helpers ----- */
function makeRef(dateReceivedISO, studentName) {
  // Format: ddmmyyyyHHmm + initials (First, Middle, Last) -> e.g., 011020250804AVL
  const d = new Date(dateReceivedISO || Date.now());
  const pad = n => String(n).padStart(2, '0');
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const HH = pad(d.getHours());
  const MM = pad(d.getMinutes());
  const parts = String(studentName || '').trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const mid   = parts.length > 2 ? parts[1]?.[0] || '' : '';
  const last  = parts.length ? parts[parts.length - 1]?.[0] || '' : '';
  const initials = (first + mid + last).toUpperCase();
  return `${dd}${mm}${yyyy}${HH}${MM}${initials}`;
}

module.exports = async (req, res) => {
  try {
    const client = await clientPromise;
    const id = getIdFromReq(req);

    /* ============================================================
       ROUTE A: Library Logs  (/api/ticket/logs)  GET/POST
       DB: process.env.LIB_DB_NAME || 'LibrabryLog', coll: 'timecapture'
       ============================================================ */
// ===== Library Logs: /api/ticket/logs  (GET/POST)
const id = getIdFromReq(req);
if (id === 'logs') {
  // Primary name uses your original spelling; we also try the common spelling just in case.
  const primaryName  = process.env.LIB_DB_NAME || 'LibrabryLog';
  const fallbackName = primaryName === 'LibrabryLog' ? 'LibraryLog' : 'LibrabryLog';
  const primaryCol   = client.db(primaryName).collection('timecapture');
  const fallbackCol  = client.db(fallbackName).collection('timecapture');

  if (req.method === 'GET') {
    const { q, purpose, course } = req.query || {};
    const filter = {};
    if (purpose && String(purpose).trim()) filter.purpose = String(purpose).trim();
    if (course  && String(course).trim())  filter.course  = String(course).trim();
    if (q && String(q).trim()) {
      const r = rx(q);
      if (r) filter.$or = [
        { name: r }, { purpose: r }, { extra: r }, { yearLevel: r }, { course: r }
      ];
    }

    // read from both DB names; merge & de-dup
    const [a, b] = await Promise.all([
      primaryCol.find(filter).sort({ _id: -1 }).toArray(),
      fallbackCol.find(filter).sort({ _id: -1 }).toArray()
    ]);
    const seen = new Set(), merged = [];
    for (const doc of [...a, ...b]) {
      const key = String(doc._id);
      if (seen.has(key)) continue; seen.add(key); merged.push(doc);
    }
    return json(res, 200, merged);
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const required = ['date','timeIn','name','yearLevel','course','purpose'];
    const miss = required.filter(k => !body[k] || String(body[k]).trim() === '');
    if (miss.length) return json(res, 400, { error: 'Missing required fields: ' + miss.join(', ') });

    const doc = {
      date: String(body.date),
      timeIn: String(body.timeIn),
      name: String(body.name),
      yearLevel: String(body.yearLevel),
      course: String(body.course),
      purpose: String(body.purpose),
      extra: body.extra ? String(body.extra) : '',
      via:   body.via   ? String(body.via)   : 'manual',
      createdAt: new Date().toISOString()
    };

    // write to the primary DB
    const r = await primaryCol.insertOne(doc);
    return json(res, 200, { ok: true, _id: r.insertedId.toString() });
  }

  res.setHeader('Allow', 'GET, POST');
  return json(res, 405, { error: 'Method Not Allowed' });
}

    /* ============================================================
       ROUTE B: Registrar LIST  (/api/ticket/list)  GET
       DB: process.env.DB_NAME || 'RegistrarDB', coll: 'ticket'
       ============================================================ */
    if (id === 'list') {
      const db = client.db(process.env.DB_NAME || 'RegistrarDB');
      const Tickets = db.collection('ticket');

      const { q, status } = req.query || {};
      const filter = {};
      if (status && String(status).trim()) filter.status = String(status).trim();

      if (q && String(q).trim()) {
        const r = rx(q);
        if (r) {
          filter.$or = [
            { ref: r }, { studentId: r }, { studentName: r }, { requestType: r },
            { remarks: r }, { staff: r }, { orNumber: r }, { receivedBy: r }
          ];
        }
      }

      // Return ALL (no limit); newest first
      const docs = await Tickets.find(filter).sort({ _id: -1 }).toArray();
      return json(res, 200, docs);
    }

    /* ============================================================
       ROUTE C: Registrar CREATE  (/api/ticket/new)  POST
       ============================================================ */
    if (id === 'new') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return json(res, 405, { error: 'Method Not Allowed' });
      }
      const db = client.db(process.env.DB_NAME || 'RegistrarDB');
      const Tickets = db.collection('ticket');

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      // minimal required fields
      const required = ['studentName', 'requestType', 'dateReceived'];
      const miss = required.filter(k => !body[k] || String(body[k]).trim() === '');
      if (miss.length) return json(res, 400, { error: 'Missing required fields: ' + miss.join(', ') });

      const doc = {
        ref: makeRef(body.dateReceived, body.studentName),
        studentId: body.studentId ? String(body.studentId) : '',
        studentName: String(body.studentName),
        requestType: String(body.requestType),
        dateReceived: toISOorNull(body.dateReceived) || new Date().toISOString(),
        scheduleRelease: toISOorNull(body.scheduleRelease) ?? null,
        dateRelease: toISOorNull(body.dateRelease) ?? null,
        targetDays: (body.targetDays === '' || body.targetDays == null) ? null : Number(body.targetDays),
        remarks: body.remarks ? String(body.remarks) : '',
        staff: body.staff ? String(body.staff) : '',
        status: body.status ? String(body.status) : 'Received',
        // extra fields you added:
        orNumber: body.orNumber ? String(body.orNumber) : '',
        dateReceivedFromIncharge: toISOorNull(body.dateReceivedFromIncharge) ?? null,
        receivedBy: body.receivedBy ? String(body.receivedBy) : '',
        createdAt: new Date().toISOString()
      };

      // compute processingDays & timeliness
      const calc = computeProcessingAndTimeliness(doc);
      if (calc.processingDays !== null) doc.processingDays = calc.processingDays;
      doc.timeliness = calc.timeliness || '';

      const r = await Tickets.insertOne(doc);
      return json(res, 200, { ok: true, _id: r.insertedId.toString(), ref: doc.ref });
    }

    /* ============================================================
       ROUTE D: Registrar PATCH/DELETE  (/api/ticket/<ObjectId>)
       ============================================================ */
    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return json(res, 400, { error: 'Invalid or missing id' });
    }
    const _id = new ObjectId(id);
    const db = client.db(process.env.DB_NAME || 'RegistrarDB');
    const Tickets = db.collection('ticket');

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const set = {};
      const allowed = [
        'status','targetDays','dateRelease','staff','remarks','scheduleRelease',
        'requestType','studentName','studentId','orNumber','dateReceivedFromIncharge','receivedBy'
      ];
      for (const k of allowed) if (Object.prototype.hasOwnProperty.call(body, k)) set[k] = body[k];

      if ('dateRelease' in set) set.dateRelease = toISOorNull(set.dateRelease);
      if ('scheduleRelease' in set) set.scheduleRelease = toISOorNull(set.scheduleRelease);
      if ('dateReceivedFromIncharge' in set) set.dateReceivedFromIncharge = toISOorNull(set.dateReceivedFromIncharge);

      if (set.status === 'Released' && (set.dateRelease === undefined || set.dateRelease === '')) {
        set.dateRelease = new Date().toISOString();
      }

      const current = await Tickets.findOne({ _id });
      if (!current) return json(res, 404, { error: 'Not found' });

      const merged = { ...current, ...set };
      const calc = computeProcessingAndTimeliness(merged);
      if (calc.processingDays !== null) set.processingDays = calc.processingDays;
      set.timeliness = calc.timeliness || '';

      const r = await Tickets.updateOne({ _id }, { $set: set });
      if (!r.matchedCount) return json(res, 404, { error: 'Not found' });
      return json(res, 200, { ok: true, _id: id });
    }

    if (req.method === 'DELETE') {
      const r = await Tickets.deleteOne({ _id });
      if (!r.deletedCount) return json(res, 404, { error: 'Not found' });
      return json(res, 200, { ok: true, _id: id });
    }

    res.setHeader('Allow', 'PATCH, DELETE');
    return json(res, 405, { error: 'Method Not Allowed' });

  } catch (e) {
    return json(res, 500, { error: e.message || String(e) });
  }
};
