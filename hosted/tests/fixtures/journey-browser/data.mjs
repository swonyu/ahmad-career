// Fictional fixtures. Never import this module from production code.
export const BOARD = 'synthetic-harbor-research';
export const SOURCE_ID = `lever:global:${BOARD}`;
export const accounts = Object.freeze({
  a: {id: 'journey-synthetic-a', email: 'alex.journey@example.com', name: 'Synthetic Alex'},
  b: {id: 'journey-synthetic-b', email: 'sam.journey@example.com', name: 'Synthetic Sam'},
});
export const postingId = number => `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
export const postingURL = number => `https://jobs.lever.co/${BOARD}/${postingId(number)}`;
const definitions = [
  ['Service Designer', 'Amman', 'JO', 'hybrid'],
  ['Service Designer', 'Toronto', 'CA', 'on-site'],
  ['Registered Nurse', 'Toronto', 'CA', 'on-site'],
  ['Accountant', 'Cairo', 'EG', 'hybrid'],
  ['Primary School Teacher', 'Amman', 'JO', 'on-site'],
  ['Software Engineer', 'Remote', 'GB', 'remote'],
];
export const postings = definitions.map(([text, location, country, workplaceType], index) => ({
  id: postingId(index + 1), text, categories: {location, team: 'Synthetic team', commitment: 'Full-time'},
  country, workplaceType, hostedUrl: postingURL(index + 1), applyUrl: `${postingURL(index + 1)}/apply`,
  descriptionPlain: `Fictional ${text} opportunity in ${location}. Synthetic journey fixture only. No employer receives requests.`,
  additionalPlain: 'Use fictional applicant information and a synthetic CV only.',
}));
// Separate search-only observations; the six original application fixtures and
// their reviewed requirements above are unchanged. Newness comes from the app.
export const searchSequenceEpoch = Date.parse('2026-11-21T18:00:00.000Z');
export const searchSequencePostings = [
  ['Service Designer', 'Amman', 'JO', 'hybrid'],
  ['Service Designer', 'Toronto', 'CA', 'on-site'],
  ['Senior Service Designer', 'Remote', 'GB', 'remote'],
].map(([text, location, country, workplaceType], index) => ({
  id: postingId(index + 101), text, categories: {location, team: 'Synthetic search team', commitment: 'Full-time'},
  country, workplaceType, hostedUrl: postingURL(index + 101), applyUrl: `${postingURL(index + 101)}/apply`,
  descriptionPlain: `Fictional ${text} opportunity in ${location}. Synthetic search-history observation only.`,
  additionalPlain: 'No real employer receives requests. This search scenario has no application requirements configuration.',
}));
export const searchSequences = Object.freeze({
  ab: [searchSequencePostings[0], searchSequencePostings[1]],
  bc: [searchSequencePostings[1], searchSequencePostings[2]],
  cb: [searchSequencePostings[2], searchSequencePostings[1]],
});
export const catalog = {
  ok: true, version: 1, defaultSources: [SOURCE_ID],
  sources: [{id: SOURCE_ID, name: 'Synthetic Harbor Research Studio', provider: 'lever', region: 'global', board: BOARD, boardUrl: `https://jobs.lever.co/${BOARD}`}],
  limits: {maxSources: 4, pageSize: 50, maxJobsPerSource: 500},
  notice: 'Synthetic local employer board. These fictional jobs cannot be applied to outside this fixture.',
};
export const fidelity = {
  real: ['PhoneApp and components', 'EN/AR messages and CSS', 'encrypted vault and safety storage', 'PDF worker and parser', 'HTTP response validation', 'discovery search/cache/filtering', 'hosted profile, job, preparation, approval, dispatch, Stop and receipt handlers', 'isolated D1/R2 storage'],
  simulated: ['allowlisted account identity edge', 'fictional employer catalog and provider responses', 'test-only liveEnabled capability envelope', 'network fault controls', 'cache expiry control', 'explicit search-sequence discovery clock'],
  excluded: ['real OAuth or identity verification', 'live provider readiness', 'real applications', 'production persistence', 'physical device or assistive-technology acceptance'],
};
