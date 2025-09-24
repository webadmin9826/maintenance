const { MongoClient } = require('mongodb');

let clientPromise;
const uri = process.env.MONGODB_URI || '';

if (!uri) {
  clientPromise = Promise.reject(new Error('Missing MONGODB_URI env var'));
} else {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  clientPromise = client.connect();
}

module.exports = clientPromise;
