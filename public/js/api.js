// Shared frontend API helper — used by every dashboard page.
const API_BASE = '/api';

function getToken() { return localStorage.getItem('ks_token'); }
function getUser() {
  try { return JSON.parse(localStorage.getItem('ks_user') || 'null'); } catch { return null; }
}
function setSession(token, user) {
  localStorage.setItem('ks_token', token);
  localStorage.setItem('ks_user', JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem('ks_token');
  localStorage.removeItem('ks_user');
}
function requireLogin(expectedRole) {
  const user = getUser();
  if (!getToken() || !user) { window.location.href = '/'; return null; }
  if (expectedRole && user.role !== expectedRole) { window.location.href = '/'; return null; }
  return user;
}
function logout() { clearSession(); window.location.href = '/'; }

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    if (res.status === 401) { clearSession(); window.location.href = '/'; }
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
function statusBadgeClass(status) {
  const green = ['VERIFIED', 'DELIVERED', 'FULFILLED', 'PICKED_UP', 'CONFIRMED', 'PROCESSED', 'PILGRIM_DISTRIBUTED'];
  const orange = ['PENDING_VERIFICATION', 'AVAILABLE', 'PICKUP_ACCEPTED', 'ASSIGNED', 'IN_TRANSIT', 'OPEN', 'MATCHED', 'PARTIALLY_FULFILLED', 'REPORTED'];
  const red = ['SUSPENDED', 'NOT_FIT', 'WASTED', 'EXPIRED', 'CANCELLED'];
  if (green.includes(status)) return 'green';
  if (orange.includes(status)) return 'orange';
  if (red.includes(status)) return 'red';
  return 'gray';
}
