// Private synthetic support. No production module imports this directory.
export const BOARD = 'synthetic-native-journey';
export const SOURCE_ID = `lever:global:${BOARD}`;
export const OWNER = Object.freeze({
  id: 'native-journey-fictional-owner',
  email: 'jamie.native@example.com',
  name: 'Jamie Sample',
});
export const PDF = Object.freeze({
  relativePath: 'postman/fixtures/integration-resume.pdf',
  sha256: 'fccbd3962e482d8b24bea10c69ec047e0879cc55cf3c3b3222909bd89108b86a',
  bytes: 609,
  names: Object.freeze(['CV-A.pdf', 'CV-B.pdf']),
});
export const postingId = number => `20000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
export const postingURL = number => `https://jobs.lever.co/${BOARD}/${postingId(number)}`;
export const postings = Object.freeze([1, 2].map(number => Object.freeze({
  id: postingId(number), text: number === 1 ? 'Service Designer' : 'Senior Service Designer',
  categories: {location: 'Riyadh', team: 'Fictional design team', commitment: 'Full-time'},
  country: 'SA', workplaceType: 'hybrid', hostedUrl: postingURL(number), applyUrl: `${postingURL(number)}/apply`,
  descriptionPlain: 'Fictional service design opportunity in Riyadh. Synthetic native journey only. No employer receives requests.',
  additionalPlain: 'Use fictional contact details and the provided synthetic PDF only.',
})));
export const catalog = Object.freeze({
  ok: true, version: 1, defaultSources: [SOURCE_ID],
  sources: [{id: SOURCE_ID, name: 'Synthetic Native Journey Studio', provider: 'lever', region: 'global', board: BOARD, boardUrl: `https://jobs.lever.co/${BOARD}`}],
  limits: {maxSources: 4, pageSize: 50, maxJobsPerSource: 500},
  notice: 'Fictional local employer board. No submission or employer network request is permitted.',
});
export const fidelity = Object.freeze({
  real: ['current hosted application handler', 'native bearer authentication and ownership', 'isolated D1 and R2',
    'profile validation and revisions', 'PDF parsing and storage', 'job import and canonical identity',
    'preparation and immutable attempt snapshots', 'current discovery parser, cache and filters'],
  simulated: ['one fictional trusted identity during explicit initial pairing only', 'allowlisted fictional catalog and provider GET responses',
    'test adapter mode', 'explicit open/closed/unavailable board response and cache-expiry controls', 'loopback HTTPS transport'],
  excluded: ['live identity verification', 'production persistence', 'approval, dispatch or real employer requests',
    'capability rewriting', 'seeded contact, PDF, saved job, prepared attempt or follow-up outcomes'],
});
