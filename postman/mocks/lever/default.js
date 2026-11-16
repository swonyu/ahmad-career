/* Local test-only dependency. Contract: https://github.com/lever/postings-api.
 * This is not the application under test and never contacts Lever.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const counts = new Map();
const observations = [];
const SITE = 'career-fixture';
const PREFIX = '00000000-0000-4000-8000-';
const fixture = id => /^00000000-0000-4000-8000-00000000000[1-7]$/.test(id);
const json = (res, status, body, headers = {}) => {
  res.writeHead(status, {'Content-Type':'application/json', ...headers});
  res.end(JSON.stringify(body));
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/__test/observations' && req.method === 'GET') {
      return json(res, 200, {testOnly:true, observations, counts:Object.fromEntries(counts)});
    }
    if (url.pathname === '/__test/reset' && req.method === 'POST') {
      counts.clear(); observations.length = 0;
      return json(res, 200, {testOnly:true, reset:true});
    }
    const match = url.pathname.match(/^\/v0\/postings\/career-fixture\/([^/]+)$/);
    if (!match || !fixture(match[1])) return json(res, 501, {ok:false,error:'Endpoint outside this documented fixture'});
    const id = match[1];
    if (req.method === 'GET') {
      return json(res, 200, {
        id, text:'Synthetic Software Developer — ' + id.slice(-1),
        categories:{location:'Riyadh',commitment:'Full-time',team:'Engineering'},
        country:'SA', workplaceType:'hybrid',
        descriptionPlain:'Synthetic integration fixture. This is not a vacancy.',
        hostedUrl:'https://jobs.lever.co/' + SITE + '/' + id,
        applyUrl:'https://jobs.lever.co/' + SITE + '/' + id + '/apply'
      });
    }
    if (req.method !== 'POST') return json(res, 501, {ok:false,error:'Method outside this fixture'});
    if (url.searchParams.get('key') !== 'fixture-key-never-real') return json(res, 401, {ok:false,error:'Synthetic credential required'});
    const parts = [];
    for await (const part of req) parts.push(Buffer.from(part));
    const streamed = Buffer.concat(parts);
    const parsed = req.body;
    // Postman's interceptor consumes the stream and supplies the original
    // multipart body as a string; standalone Node supplies stream chunks.
    const raw = streamed.length ? streamed : Buffer.isBuffer(parsed) ? parsed
      : typeof parsed === 'string' ? Buffer.from(parsed, 'utf8') : Buffer.alloc(0);
    const text = raw.toString('utf8');
    const count = (counts.get(id) || 0) + 1;
    counts.set(id, count);
    observations.push({
      id, count, method:req.method,
      multipart:/^multipart\/form-data;\s*boundary=/i.test(req.headers['content-type'] || ''),
      byteLength:raw.length,
      hasPDFBytes:raw.includes(Buffer.from('%PDF-')),
      hasNameField:/name="name"/.test(text),
      hasEmailField:/name="email"/.test(text),
      hasResumeField:/name="resume"/.test(text),
      bodySHA256:crypto.createHash('sha256').update(raw).digest('hex'),
      interceptedBodyType:parsed === undefined ? 'undefined' : (Buffer.isBuffer(parsed) ? 'buffer' : typeof parsed)
    });
    if (!/^multipart\/form-data;\s*boundary=/i.test(req.headers['content-type'] || '') ||
        !/name="name"/.test(text) || !/name="email"/.test(text) ||
        !/name="resume"/.test(text) || !raw.includes(Buffer.from('%PDF-'))) {
      return json(res, 400, {ok:false,error:'Synthetic fixture requires name, email and a PDF file in multipart form data'});
    }
    const scenario = id.slice(-1);
    if (scenario === '2') return json(res, 200, {ok:true});
    if (scenario === '3') return json(res, 503, {ok:false,error:'Synthetic upstream failure'});
    if (scenario === '4') await new Promise(resolve => setTimeout(resolve, 2000));
    if (scenario === '5' && count === 1) return json(res, 429, {ok:false,error:'Synthetic rate limit'}, {'Retry-After':'1'});
    if (scenario === '6') return json(res, 400, {ok:false,error:'Synthetic rejection'});
    if (scenario === '7') {
      res.writeHead(302, {Location:'https://example.com/never-follow'});
      return res.end();
    }
    return json(res, 200, {ok:true, applicationId:'test-application-' + id});
  } catch {
    if (!res.headersSent) return json(res, 500, {ok:false,error:'Synthetic mock handler failure'});
    res.end();
  }
}).listen(Number(process.env.PORT || 4901), '127.0.0.1');
