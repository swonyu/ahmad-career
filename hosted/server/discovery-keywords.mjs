export const DISCOVERY_KEYWORD_MATCHING_VERSION='latin-word-start-v1';

const fold=value=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
const latinStart=/^[\p{Script=Latin}\p{N}]/u;
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

/** Preserve prefix typing without finding Latin keywords inside unrelated words. */
export function createDiscoveryKeywordMatcher(query){
  const terms=fold(query).split(/\s+/u).filter(Boolean).map(term=>({
    term,
    // A different writing system can directly adjoin a Latin skill (开发iOS).
    // Arabic prefixes and scripts without spaces retain literal substring search.
    pattern:latinStart.test(term)?new RegExp('(?:^|[^\\p{Script=Latin}\\p{N}])'+escapeRegExp(term),'u'):null,
  }));
  return text=>{
    const value=fold(text);
    return terms.every(({term,pattern})=>pattern?pattern.test(value):value.includes(term));
  };
}
