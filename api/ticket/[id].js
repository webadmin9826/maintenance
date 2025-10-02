// /api/ticket/[id].js
// Unified router for Registrar tickets + Library logs.
// Routes:
//   /api/ticket/logs       → Library logs (GET filters, POST insert)
//   /api/ticket/list       → Registrar list (GET all, with filters)
//   /api/ticket/new        → Registrar create (POST)
//   /api/ticket/<ObjectId> → Registrar update (PATCH), delete (DELETE)

const { ObjectId } = require('mongodb');
const clientPromise = require('../../lib/mongo');
const { computeProcessingAndTimeliness } = require('./_helper');

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

function rx(val) { try { return new RegExp(String(val).trim(), 'i'); } catch { return null; } }

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

// Registrar ticket reference like 011020250804AVL
function makeRef(dateReceivedISO, studentName) {
  const d = new Date(dateReceivedISO || Date.now());
  const pad = n => String(n).padStart(2,'0');
  const dd = pad(d.getDate()), mm = pad(d.getMonth()+1), yyyy = d.getFullYear();
  const HH = pad(d.getHours()), MM = pad(d.getMinutes());
  const parts = String(studentName || '').trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const mid   = parts.length > 2 ? parts[1]?.[0] || '' : '';
  const last  = parts.length ? parts[parts.length-1]?.[0] || '' : '';
  const initials = (first + mid + last).toUpperCase();
  return `${dd}${mm}${yyyy}${HH}${MM}${initials}`;
}

module.exports = async (req, res) => {
  try {
    const client = await clientPromise;
    const routeId = getIdFromReq(req); // ← declared ONCE

    /* ============ Library Logs: /api/ticket/logs (GET/POST) ============ */
    if (routeId === 'logs') {
      const primaryName  = process.env.LIB_DB_NAME || 'ticketingDB'; // your original spelling
      const fallbackName = primaryName === 'ticketingDB' ? 'ticketingDB' : 'ticketingDB';
      const primaryCol   = client.db(primaryName).collection('timecapture');
      const fallbackCol  = client.db(fallbackName).collection('timecapture');

      if (req.method === 'GET') {
        const { q, purpose, course } = req.query || {};
        const filter = {};
        if (purpose && String(purpose).trim()) filter.purpose = String(purpose).trim();
        if (course  && String(course).trim())  filter.course  = String(course).trim();
        if (q && String(q).trim()) {
          const r = rx(q);
          if (r) filter.$or = [{ name:r }, { purpose:r }, { extra:r }, { yearLevel:r }, { course:r }];
        }
        const [a,b] = await Promise.all([
          primaryCol.find(filter).sort({ _id: -1 }).toArray(),
          fallbackCol.find(filter).sort({ _id: -1 }).toArray()
        ]);
        const seen = new Set(), merged = [];
        for (const doc of [...a, ...b]) { const k=String(doc._id); if (seen.has(k)) continue; seen.add(k); merged.push(doc); }
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
        const r = await primaryCol.insertOne(doc); // write to primary
        return json(res, 200, { ok: true, _id: r.insertedId.toString() });
      }

      res.setHeader('Allow', 'GET, POST');
      return json(res, 405, { error: 'Method Not Allowed' });
    }

    /* ============ Registrar LIST: /api/ticket/list (GET) ============ */
    if (routeId === 'list') {
      const db = client.db(process.env.DB_NAME || 'RegistrarDB');
      const Tickets = db.collection('ticket');

      const { q, status } = req.query || {};
      const filter = {};
      if (status && String(status).trim()) filter.status = String(status).trim();
      if (q && String(q).trim()) {
        const r = rx(q);
        if (r) {
          filter.$or = [
            { ref:r }, { studentId:r }, { studentName:r }, { requestType:r },
            { remarks:r }, { staff:r }, { orNumber:r }, { receivedBy:r }
          ];
        }
      }
      const docs = await Tickets.find(filter).sort({ _id: -1 }).toArray(); // all
      return json(res, 200, docs);
    }

    /* ============ Registrar CREATE: /api/ticket/new (POST) ============ */
    if (routeId === 'new') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return json(res, 405, { error: 'Method Not Allowed' });
      }
      const db = client.db(process.env.DB_NAME || 'RegistrarDB');
      const Tickets = db.collection('ticket');

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const required = ['studentName','requestType','dateReceived'];
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
        orNumber: body.orNumber ? String(body.orNumber) : '',
        dateReceivedFromIncharge: toISOorNull(body.dateReceivedFromIncharge) ?? null,
        receivedBy: body.receivedBy ? String(body.receivedBy) : '',
        createdAt: new Date().toISOString()
      };
      const calc = computeProcessingAndTimeliness(doc);
      if (calc.processingDays !== null) doc.processingDays = calc.processingDays;
      doc.timeliness = calc.timeliness || '';

      const r = await Tickets.insertOne(doc);
      return json(res, 200, { ok:true, _id:r.insertedId.toString(), ref:doc.ref });
    }

    /* ============ Registrar PATCH/DELETE: /api/ticket/<ObjectId> ============ */
    if (!/^[a-fA-F0-9]{24}$/.test(routeId)) {
      return json(res, 400, { error: 'Invalid or missing id' });
    }
    const objId = new ObjectId(routeId);
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

      const current = await Tickets.findOne({ _id: objId });
      if (!current) return json(res, 404, { error: 'Not found' });

      const merged = { ...current, ...set };
      const calc = computeProcessingAndTimeliness(merged);
      if (calc.processingDays !== null) set.processingDays = calc.processingDays;
      set.timeliness = calc.timeliness || '';

      const r = await Tickets.updateOne({ _id: objId }, { $set: set });
      if (!r.matchedCount) return json(res, 404, { error: 'Not found' });
      return json(res, 200, { ok:true, _id: routeId });
    }

    if (req.method === 'DELETE') {
      const r = await Tickets.deleteOne({ _id: objId });
      if (!r.deletedCount) return json(res, 404, { error: 'Not found' });
      return json(res, 200, { ok:true, _id: routeId });
    }

    res.setHeader('Allow', 'PATCH, DELETE');
    return json(res, 405, { error: 'Method Not Allowed' });

  } catch (e) {
    return json(res, 500, { error: e.message || String(e) });
  }
};
