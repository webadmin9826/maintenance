module.exports = (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).end(JSON.stringify({ ok: true, ts: new Date().toISOString() }));
};
