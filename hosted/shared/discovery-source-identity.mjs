/** Shared browser-safe ATS identity rules. No catalog, service state or transport. */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const BOARD=/^[a-z0-9][a-z0-9_-]{0,79}$/i;
const throwError=message=>{throw new Error(message)};

export function sourceRecord(provider,region,board,name=board){
  const id=provider==='greenhouse'?`greenhouse:${board}`:`lever:${region}:${board}`;
  const host=provider==='greenhouse'?'job-boards.greenhouse.io':region==='eu'?'jobs.eu.lever.co':'jobs.lever.co';
  return {id,name,provider,region,board,boardUrl:`https://${host}/${board}`};
}

/** Parse only an identity; a supplied rejection callback must throw. */
export function parseDiscoverySourceIdentity(value,reject=throwError){
  if(typeof value!=='string'||value.length>2048||/[\s\\\x00-\x1f\x7f]/u.test(value))reject('Choose a supported HTTPS employer-board URL or source ID.');
  let provider,region='global',board;
  if(/^https:\/\//i.test(value)){
    // Reject raw traversal and encoded path material before URL normalization can erase it.
    if(/(?:\/\.{1,2}(?:\/|$)|%)/.test(value.split(/[?#]/,1)[0]))reject('Use the direct employer-board URL without encoded or relative path segments.');
    let url;try{url=new URL(value)}catch{reject('The employer-board URL is invalid.')}
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||/%/.test(url.pathname))reject('Use a supported HTTPS board URL without credentials, fragments or a custom port.');
    const pieces=url.pathname.replace(/\/$/,'').split('/').slice(1);
    if(['boards.greenhouse.io','job-boards.greenhouse.io'].includes(url.hostname)){
      provider='greenhouse';
      if(url.pathname==='/embed/job_board'){
        if([...url.searchParams.keys()].some(k=>k!=='for')||url.searchParams.getAll('for').length!==1)reject('Use the employer board token from its Greenhouse link.');
        board=url.searchParams.get('for');
      }else{
        if(!(pieces.length===1||pieces.length===3&&pieces[1]==='jobs'&&/^\d{1,20}$/.test(pieces[2])))reject('Use a Greenhouse board or direct job posting link.');
        board=pieces[0];
      }
    }else if(['jobs.lever.co','jobs.eu.lever.co'].includes(url.hostname)){
      provider='lever';region=url.hostname==='jobs.eu.lever.co'?'eu':'global';
      if(!(pieces.length===1||pieces.length===2&&UUID.test(pieces[1])||pieces.length===3&&UUID.test(pieces[1])&&pieces[2]==='apply'))reject('Use a Lever board or direct job posting link.');
      board=pieces[0];
    }else reject('This board is not supported. Choose Greenhouse or Lever, or keep its link as a manual opportunity.');
    if(url.pathname!=='/embed/job_board'&&[...url.searchParams.keys()].some(k=>!/^utm_[a-z0-9_]+$/i.test(k)&&!['gh_jid','lever-source','lever-origin','source'].includes(k)))reject('Remove extra parameters from the employer-board URL.');
  }else{
    const parts=value.split(':');
    if(parts.length===2&&parts[0]==='greenhouse'){provider='greenhouse';board=parts[1]}
    else if(parts.length===3&&parts[0]==='lever'&&['global','eu'].includes(parts[1])){provider='lever';region=parts[1];board=parts[2]}
    else reject('Use greenhouse:board, lever:global:board or lever:eu:board.');
  }
  if(typeof board!=='string'||!BOARD.test(board))reject('A board token must contain 1–80 letters, digits, underscores or hyphens.');
  board=board.toLowerCase();return sourceRecord(provider,region,board);
}
