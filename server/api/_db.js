/**
 * Cached MongoClient for serverless (Vercel) functions.
 *
 * Each warm lambda reuses a single connection pool across invocations.
 * We stash the client promise on globalThis so that hot-reloads during
 * `vercel dev` and concurrent invocations share one client instead of
 * opening a new connection (and pool) every request.
 */
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'mongolingo';

if (!uri) {
  // Surface a clear error at import time rather than a cryptic driver error.
  console.warn('[dblingo] MONGODB_URI is not set. Set it in your environment / Vercel project.');
}

/** @type {Promise<MongoClient> | undefined} */
let clientPromise = globalThis.__dblingoClientPromise;

function createClientPromise() {
  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000
  });
  return client.connect();
}

export async function getDb() {
  if (!uri) throw new Error('MONGODB_URI is not configured');
  if (!clientPromise) {
    clientPromise = createClientPromise();
    globalThis.__dblingoClientPromise = clientPromise;
  }
  const client = await clientPromise;
  return client.db(dbName);
}

/** Per-collection "indexes ensured" flags, shared across hot reloads. */
const ensured = globalThis.__dblingoIndexesEnsuredMap || (globalThis.__dblingoIndexesEnsuredMap = {});

/**
 * Return a collection, ensuring its indexes once per warm lambda.
 * Index creation is best-effort; a failure never fails the request.
 */
async function getCollection(name, ensureIndexes) {
  const db = await getDb();
  const collection = db.collection(name);
  if (!ensured[name]) {
    try {
      await ensureIndexes(collection);
      ensured[name] = true;
    } catch (e) {
      console.warn(`[dblingo] index ensure failed for ${name}:`, e?.message);
    }
  }
  return collection;
}

/** Global player records: one per userId. */
export function getPlayers() {
  return getCollection('players', async (players) => {
    await players.createIndex({ userId: 1 }, { unique: true });
    await players.createIndex({ pack: 1, xp: -1 });
  });
}

/** Event definitions (admin-created). One per URL-safe eventId slug. */
export function getEvents() {
  return getCollection('events', async (events) => {
    await events.createIndex({ eventId: 1 }, { unique: true });
  });
}

/** Per-event scores: one per (eventId, userId). xp = XP earned during the event. */
export function getEventScores() {
  return getCollection('event_scores', async (scores) => {
    await scores.createIndex({ eventId: 1, userId: 1 }, { unique: true });
    await scores.createIndex({ eventId: 1, xp: -1, updatedAt: 1 });
  });
}
