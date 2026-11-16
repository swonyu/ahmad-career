import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

export class ApplicationError extends Error {
  constructor(code, message, status = 422) { super(message); this.code = code; this.status = status; }
}
export const fail = (code, message, status) => { throw new ApplicationError(code, message, status); };
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const canonical = value => JSON.stringify(sort(value));
function sort(value) { return Array.isArray(value) ? value.map(sort) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])])) : value; }
export const countryCodes = new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'.split(' '));
export function object(value, allowed, label = 'Request') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail('invalid_object', `${label} must be a JSON object.`);
  if (Object.keys(value).some(k => !allowed.includes(k))) fail('unknown_field', `${label} contains an unsupported field.`);
  return value;
}
export function text(value, label, max = 250, optional = true, multiline = false) {
  if (value === undefined && optional) return '';
  if (typeof value !== 'string' || value.length > max || (multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(value)) fail('invalid_field', `${label} is invalid or too long.`);
  const result = value.trim();
  if (!optional && !result) fail('required_field', `${label} is required.`);
  return result;
}
function list(value, label, max = 30) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) fail('invalid_field', `${label} must be a short list.`);
  return [...new Set(value.map(x => text(x, label, 100, false)))];
}
export function country(value, optional = true) {
  const s = text(value, 'Country', 2, optional).toUpperCase();
  if (s && !countryCodes.has(s)) fail('invalid_country', 'Choose a recognized country or region code.');
  return s;
}
export function publicURL(value) {
  const s = text(value, 'Website URL', 2048, false);
  let u; try { u = new URL(s); } catch { fail('invalid_url', 'Enter a complete public HTTPS URL.'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port && u.port !== '443' || isIP(u.hostname.replace(/^\[|\]$/g, '')) || !u.hostname.includes('.') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname) || /[\s\\]/.test(s)) fail('invalid_url', 'Use a public HTTPS URL without credentials or a custom port.');
  u.hash = '';
  return u.href;
}
export function leverTarget(value) {
  const url = new URL(publicURL(value));
  const region = url.hostname === 'jobs.lever.co' ? 'global' : url.hostname === 'jobs.eu.lever.co' ? 'eu' : null;
  if (!region) return null;
  const m = url.pathname.match(/^\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,79})\/([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})(?:\/apply)?\/?$/);
  if (!m) fail('invalid_lever_url', 'Use a direct Lever job posting URL.');
  const site = m[1], postingId = m[2].toLowerCase();
  return {provider:'lever', region, site, postingId, key:`lever:${region}:${site.toLowerCase()}:${postingId}`,url:`https://${url.hostname}/${site}/${postingId}`};
}
export function resume(value) {
  object(value, ['name','mime','dataBase64'], 'Résumé');
  const name = text(value.name, 'Résumé filename', 180, false);
  if (!/\.pdf$/i.test(name) || /[/\\:]/.test(name) || name.startsWith('.')) fail('invalid_resume', 'Choose a PDF résumé with a plain filename.');
  if (value.mime !== 'application/pdf' || typeof value.dataBase64 !== 'string' || value.dataBase64.length > Math.ceil(5*1024*1024/3)*4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.dataBase64)) fail('invalid_resume', 'Choose a PDF résumé no larger than 5 MiB.');
  const bytes = Buffer.from(value.dataBase64,'base64');
  if (bytes.length < 8 || bytes.length > 5*1024*1024 || bytes.subarray(0,5).toString('ascii') !== '%PDF-' || bytes.toString('base64') !== value.dataBase64) fail('invalid_resume', 'The uploaded résumé is not a valid PDF byte stream.');
  return {name,mime:'application/pdf',dataBase64:value.dataBase64,size:bytes.length,sha256:sha256(bytes)};
}
export const profileFields = ['firstName','lastName','email','phone','city','country','headline','skills','targetRoles','targetCountries','workModes','experienceLevel','website','resume'];
export function profile(input, previous = {}) {
  object(input, profileFields, 'Profile');
  const p = {};
  for (const name of ['firstName','lastName','phone','city','headline']) p[name] = text(input[name], name, name === 'headline' ? 500 : 150);
  p.email = text(input.email,'Email',254).toLowerCase();
  if (p.email && !/^[^\s@<>]{1,64}@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(p.email)) fail('invalid_email','Enter a valid email address.');
  p.country = country(input.country);
  p.skills = list(input.skills,'Skills'); p.targetRoles = list(input.targetRoles,'Target roles');
  p.targetCountries = list(input.targetCountries,'Target countries').map(c => country(c,false));
  p.workModes = list(input.workModes,'Work modes',3);
  if (p.workModes.some(v => !['on-site','hybrid','remote'].includes(v))) fail('invalid_field','Choose on-site, hybrid or remote work.');
  p.experienceLevel = input.experienceLevel ?? 'any';
  if (!['entry','mid','senior','any'].includes(p.experienceLevel)) fail('invalid_field','Choose an experience level from the list.');
  p.website = input.website ? publicURL(input.website) : '';
  p.resume = input.resume === undefined ? previous.resume ?? null : input.resume === null ? null : resume(input.resume);
  return p;
}
export function safeProfile(p, revision) {
  const copy = {...p,revision};
  if (copy.resume) { const {dataBase64,...metadata} = copy.resume; copy.resume=metadata; }
  return copy;
}
export const applicantName = p => [p.firstName,p.lastName].filter(Boolean).join(' ').trim();
export function answers(input = {}) {
  object(input,['comments','consentStore','consentMarketing'],'Application answers');
  const result = {comments:text(input.comments,'Additional information',5000,true,true)};
  for (const field of ['consentStore','consentMarketing']) {
    if (input[field] !== undefined) { if(typeof input[field] !== 'boolean') fail('invalid_consent','Consent choices must be explicit true or false values.'); result[field]=input[field]; }
  }
  return result;
}
export function requiredProfile(p) {
  const missing = [];
  if (!p.firstName) missing.push('name'); if (!p.email) missing.push('email'); if (!p.resume) missing.push('PDF résumé');
  return missing.length ? `Complete your ${missing.join(', ')} before automatic submission.` : '';
}
