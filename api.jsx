/* MongoLingo — frontend API client for the optional Vercel backend.
 *
 * The app is a static site (GitHub Pages). This module talks to the
 * separate Vercel backend ONLY when API_BASE is set. If it's empty or any
 * request fails, every helper degrades gracefully (returns null / []), so
 * the app keeps working with its built-in stub leaderboard.
 *
 * To enable: set API_BASE to your deployed backend, e.g.
 *   const API_BASE = 'https://mongolingo-api.vercel.app/api';
 * For local testing against `vercel dev`, use 'http://localhost:3000/api'.
 */
const API_BASE = (window.MONGOLINGO_API_BASE || '').replace(/\/$/, '');

const USER_ID_KEY = 'mongolingo.userId.v1';

function getUserId() {
  try {
    let id = localStorage.getItem(USER_ID_KEY);
    if (!id) {
      id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(USER_ID_KEY, id);
    }
    return id;
  } catch (e) {
    return 'u_anon';
  }
}

function apiEnabled() {
  return !!API_BASE;
}

async function apiFetch(path, options) {
  if (!API_BASE) return null;
  try {
    const res = await fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function registerUser({ name, company, pack, eventId }) {
  if (!apiEnabled()) return null;
  return apiFetch('/register', {
    method: 'POST',
    body: JSON.stringify({ userId: getUserId(), name, company, pack, eventId: eventId || undefined })
  });
}

async function submitScore({ xp, leaves, streak, pack, name, company, eventId }) {
  if (!apiEnabled()) return null;
  return apiFetch('/leaderboard', {
    method: 'POST',
    body: JSON.stringify({ userId: getUserId(), xp, leaves, streak, pack, name, company, eventId: eventId || undefined })
  });
}

async function fetchLeaderboard({ pack, eventId, limit = 10 } = {}) {
  if (!apiEnabled()) return null;
  const qs = new URLSearchParams();
  if (eventId) qs.set('event', eventId);
  else if (pack) qs.set('pack', pack);
  if (limit) qs.set('limit', String(limit));
  const data = await apiFetch('/leaderboard?' + qs.toString(), { method: 'GET' });
  return data && Array.isArray(data.leaders) ? data.leaders : null;
}

/* ---------- Event leaderboards ----------
 * Events are created by an admin (ADMIN_KEY on the backend). Players join
 * through an invite link: <app url>?event=<eventId>. */

/** Resolve an event by id. Returns the event, or null if missing/unreachable. */
async function fetchEvent(eventId) {
  if (!apiEnabled() || !eventId) return null;
  const data = await apiFetch('/events?id=' + encodeURIComponent(eventId), { method: 'GET' });
  return data && data.event ? data.event : null;
}

/** Admin calls surface errors (unlike player calls) so the form can show them. */
async function adminFetch(path, adminKey, options) {
  if (!API_BASE) return { error: 'Backend is not configured (MONGOLINGO_API_BASE).' };
  try {
    const res = await fetch(API_BASE + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminKey }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || ('Request failed (' + res.status + ')') };
    return data;
  } catch (e) {
    return { error: 'Network error — is the backend reachable?' };
  }
}

function createEvent(adminKey, { name, eventId, pack, startsAt, endsAt }) {
  return adminFetch('/events', adminKey, {
    method: 'POST',
    body: JSON.stringify({ name, eventId: eventId || undefined, pack: pack || undefined, startsAt: startsAt || undefined, endsAt: endsAt || undefined })
  });
}

function listEvents(adminKey) {
  return adminFetch('/events', adminKey, { method: 'GET' });
}

/** Shareable invite link for an event, based on the current page URL. */
function getInviteLink(eventId) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  if (eventId) url.searchParams.set('event', eventId);
  return url.toString();
}

window.MongoLingoAPI = {
  apiEnabled,
  getUserId,
  registerUser,
  submitScore,
  fetchLeaderboard,
  fetchEvent,
  createEvent,
  listEvents,
  getInviteLink
};
