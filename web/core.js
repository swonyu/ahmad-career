(function(root){
  const isSaudi=text=>/saudi|\briyadh\b|\bjeddah\b|\bdammam\b|\bkhobar\b|\bSAU\b|الرياض|جدة|السعودية/i.test(text||'');
  function relevance(title){
    if(/\bintern(ship)?\b|trainee|graduate|early[ -](?:in[ -])?career|sales|account manager|clinical|chemist|scientist|engineer|financial analyst|regulatory|QA\/RA/i.test(title||''))return 0;
    if(/supply.?chain|procurement|purchas|tender|logistics|warehouse|demand.?plan|supply.?plan|inventory|supplier/i.test(title||''))return /manager|director|head|lead/i.test(title)?90:65;
    if(/performance|operational excellence|continuous improvement|transformation|operations manager/i.test(title||''))return 80;
    if(/business[ -]value[ -]partner/i.test(title||''))return 65;
    return 0;
  }
  const safeURL=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:'#'}catch{return '#'}};
  const isExpired=(value,now=new Date())=>value?String(value).slice(0,10)<now.toISOString().slice(0,10):false;
  const dedupe=rows=>[...new Map(rows.map(j=>[j.id,j])).values()];
  root.CareerCore={isSaudi,relevance,safeURL,isExpired,dedupe};
})(globalThis);
