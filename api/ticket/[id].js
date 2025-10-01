// api/ticket/[id].js
const { ObjectId } = require('mongodb');
const clientPromise = require('../../lib/mongo');
const { computeProcessingAndTimeliness } = require('./_helper');

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

// best-effort date → ISO, or return null/unchanged if not parseable
function toISOorNull(v) {
  if (v === null) return null;
  if (v === undefined || v === '') return undefined; // don't set if empty string
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : v; // if already ISO string, keep; if parseable, ISO; else raw
}

function getIdFromReq(req) {
  // Vercel/Node receives req.query.id; make it robust
  const q = req.query || {};
  let id = q.id;
  if (Array.isArray(id)) id = id[0];
  // Fallback: try to read from URL if needed
  if (!id && req.url) {
    const m = req.url.match(/\/api\/ticket\/([a-fA-F0-9]{24})(?:\?|$)/);
    if (m) id = m[1];
  }
  return id;
}

module.exports = async (req, res) => {
  try {
    const id = getIdFromReq(req);
    if (!id || !/^[a-fA-F0-9]{24}$/.test(id)) {
      return json(res, 400, { error: 'Invalid or missing id' });
    }
    const _id = new ObjectId(id);

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'RegistrarDB');
    const Tickets = db.collection('ticket');

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const set = {};

      // Allow-list of fields we accept from the UI
      const allowed = [
        'status', 'targetDays', 'dateRelease', 'staff', 'remarks', 'scheduleRelease',
        'requestType', 'studentName', 'studentId',
        // NEW fields
        'orNumber', 'dateReceivedFromIncharge', 'receivedBy'
      ];

      for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(body, k)) {
          set[k] = body[k];
        }
      }

      // Normalize date-like values to ISO where appropriate
      if ('dateRelease' in set) set.dateRelease = toISOorNull(set.dateRelease);
      if ('scheduleRelease' in set) set.scheduleRelease = toISOorNull(set.scheduleRelease);
      if ('dateReceivedFromIncharge' in set) set.dateReceivedFromIncharge = toISOorNull(set.dateReceivedFromIncharge);

      // If changing status to Released and no dateRelease provided, set now
      if (set.status === 'Released' && (set.dateRelease === undefined || set.dateRelease === '')) {
        set.dateRelease = new Date().toISOString();
      }

      // Load current doc to compute processingDays/timeliness after merge
      const current = await Tickets.findOne({ _id });
      if (!current) return json(res, 404, { error: 'Not found' });

      const merged = { ...current, ...set };
      const calc = computeProcessingAndTimeliness(merged);
      // Only set processingDays if we could compute it
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


