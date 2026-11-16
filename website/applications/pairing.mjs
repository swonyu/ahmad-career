import {randomBytes} from 'node:crypto';
import {sha256,fail} from './validation.mjs';

export const pairingSchema=`
  CREATE TABLE IF NOT EXISTS pairing_codes (code_hash TEXT PRIMARY KEY, workspace_id TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS native_sessions (token_hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
`;
export function normalizePairingCode(value) {
  if(typeof value!=='string'||value.length>40)return null;
  const code=value.toUpperCase().replace(/[- ]/g,'');
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/.test(code)?code:null;
}
export function issuePairingCode(db,{workspaceId=null,now=Date.now()}={}) {
  if(workspaceId&&!db.prepare('SELECT id FROM workspaces WHERE id=?').get(workspaceId))fail('workspace_not_found','Choose an existing workspace identifier.',404);
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const raw=[...randomBytes(16)].map(b=>alphabet[b&31]).join('');
  const expiresAt=new Date(now+5*60000).toISOString(),createdAt=new Date(now).toISOString();
  db.prepare('DELETE FROM pairing_codes WHERE expires_at<=?').run(createdAt);
  db.prepare('INSERT INTO pairing_codes(code_hash,workspace_id,created_at,expires_at) VALUES(?,?,?,?)').run(sha256(raw),workspaceId,createdAt,expiresAt);
  return {pairingCode:raw.match(/.{4}/g).join('-'),expiresAt,workspaceId};
}
