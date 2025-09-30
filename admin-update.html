// api/ticket/[id].js
const { ObjectId } = require('mongodb');
const clientPromise = require('../../lib/mongo');
const { computeProcessingAndTimeliness } = require('./_helper');

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  try {
    const { id } = req.query || {};
    if (!id || !/^[a-fA-F0-9]{24}$/.test(id)) {
      return json(res, 400, { error: 'Invalid or missing id' });
    }
    const _id = new ObjectId(id);
    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'RegistrarDB');
    const Tickets = db.collection('ticket');

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      // Build $set from permitted fields
      const set = {};
      const allowed = ['status','targetDays','dateRelease','staff','remarks','scheduleRelease','requestType','studentName','studentId'];
      for (const k of allowed) {
        if (k in body) set[k] = body[k];
      }

      // If status => Released and no dateRelease provided, set it to now
      if (set.status === 'Released' && !set.dateRelease) {
        set.dateRelease = new Date().toISOString();
      }

      // Load current document to compute processingDays/timeliness
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
