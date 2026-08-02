const mongoose = require('mongoose');

const connectDB = async () => {
  const primaryUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/parkpilot';
  const localFallbackUri = 'mongodb://127.0.0.1:27017/parkpilot';

  mongoose.set('strictQuery', false);

  try {
    const conn = await mongoose.connect(primaryUri, {
      serverSelectionTimeoutMS: 5000
    });
    console.log(`[MongoDB] Connected to database: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.warn(`[MongoDB Warning] Primary connection failed (${error.message}). Trying local fallback...`);
    try {
      const conn = await mongoose.connect(localFallbackUri, {
        serverSelectionTimeoutMS: 5000
      });
      console.log(`[MongoDB Fallback] Connected to local database: ${conn.connection.host}/${conn.connection.name}`);
      return conn;
    } catch (fallbackErr) {
      console.error(`[MongoDB Error] Could not connect to primary or fallback MongoDB: ${fallbackErr.message}`);
    }
  }
};

module.exports = connectDB;
