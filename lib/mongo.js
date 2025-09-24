const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || '';
let clientPromise;

if (!uri) {
  // Reject later so handlers can catch and reply with JSON
  clientPromise = Promise.reject(new Error('Missing MONGODB_URI env var'));
} else {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  clientPromise = client.connect();
}

module.exports = clientPromise;
