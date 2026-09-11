// Shared Supabase access helper for backend functions.
// Resolves the project ref + service_role key and provides PostgREST helpers.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

const PROJECTS_URL = 'https://api.supabase.com/v1/projects';
let _ref = null;
let _serviceKey = null;

async function getAccessToken(base44) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('supabase');
  return accessToken;
}

async function getProjectRef(base44) {
  if (_ref) return _ref;
  const token = await getAccessToken(base44);
  const res = await fetch(PROJECTS_URL, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Supabase projects ${res.status}: ${await res.text()}`);
  const projects = await res.json();
  _ref = projects[0]?.ref;
  if (!_ref) throw new Error('No Supabase project found');
  return _ref;
}

async function getServiceKey(base44) {
  if (_serviceKey) return _serviceKey;
  const ref = await getProjectRef(base44);
  const token = await getAccessToken(base44);
  const res = await fetch(`${PROJECTS_URL}/${ref}/api-keys`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Supabase api-keys ${res.status}: ${await res.text()}`);
  const keys = await res.json();
  _serviceKey = (keys.find((k) => k.name === 'service_role') || {}).api_key;
  if (!_serviceKey) throw new Error('Supabase service_role key not found');
  return _serviceKey;
}

async function restHeaders(base44) {
  const key = await getServiceKey(base44);
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

export async function restGet(base44, table, query) {
  const ref = await getProjectRef(base44);
  const headers = await restHeaders(base44);
  const res = await fetch(`https://${ref}.supabase.co/rest/v1/${table}?${query}`, { headers });
  if (!res.ok) throw new Error(`Supabase GET ${table} ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function restPost(base44, table, body, prefer = 'return=representation') {
  const ref = await getProjectRef(base44);
  const headers = await restHeaders(base44);
  const res = await fetch(`https://${ref}.supabase.co/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, Prefer: prefer },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase POST ${table} ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function restDelete(base44, table, query) {
  const ref = await getProjectRef(base44);
  const headers = await restHeaders(base44);
  const res = await fetch(`https://${ref}.supabase.co/rest/v1/${table}?${query}`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`Supabase DELETE ${table} ${res.status}: ${await res.text()}`);
  return res;
}