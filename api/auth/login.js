const clientPromise = require('../../lib/mongo');
const crypto = require('crypto');
function sha256(s){ return crypto.createHash('sha256').update(String(s)).digest('hex'); }

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end('Method Not Allowed'); }
    const { username, password } = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!username || !password) return res.status(400).end('Missing username/password');
    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'RegistrarDB');
    const Users = db.collection('users');

    const passHash = sha256(password);
    const cnt = await Users.countDocuments();
    if (cnt === 0) {
      await Users.insertOne({ username: 'admin', passHash: sha256('Passw0rd!'), role: 'admin', createdAt: new Date().toISOString() });
    }
    const user = await Users.findOne({ username });
    if (!user || user.passHash !== passHash) return res.status(401).end('Invalid credentials');
    return res.status(200).json({ ok: true, user: { username: user.username, role: user.role || 'admin' } });
  } catch (e) {
    return res.status(500).end(e.message || String(e));
  }
};
