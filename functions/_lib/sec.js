const SEC_ROOT = "https://www.sec.gov";
const DATA_ROOT = "https://data.sec.gov";
export async function secJson(url, env, ttl = 3600) {
  const agent = env.SEC_USER_AGENT;
  if (!agent || !/^[^\s]+(?:\/[^\s]+)?\s+contact:\s+[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(agent)) throw new Error("SEC_USER_AGENT is missing or invalid. In Cloudflare Pages > Settings > Variables and Secrets, set CompanyDecisionDashboard/1.0 contact: your-real-monitored-email@example.com and replace the example with your monitored email address.");
  const response = await fetch(url, { headers: { "User-Agent": agent, Accept: "application/json" }, cf: { cacheTtl: ttl, cacheEverything: true } });
  if (!response.ok) throw new Error(`SEC returned HTTP ${response.status}. Verify SEC_USER_AGENT and retry later.`);
  return response.json();
}
export async function resolveCompany(query, env) {
  const listing = await secJson(`${SEC_ROOT}/files/company_tickers_exchange.json`, env, 86400);
  const at = Object.fromEntries((listing.fields || []).map((name, i) => [name, i]));
  const q = query.trim().toLowerCase();
  const rows = (listing.data || []).map(row => ({ cik: String(row[at.cik]).padStart(10,"0"), name: String(row[at.name]||""), ticker: String(row[at.ticker]||""), exchange: String(row[at.exchange]||"") }));
  const exact = rows.filter(x => x.ticker.toLowerCase() === q);
  return (exact.length ? exact : rows.filter(x => x.name.toLowerCase().includes(q) || x.ticker.toLowerCase().startsWith(q))).slice(0,12);
}
const TAGS = { revenue:["RevenueFromContractWithCustomerExcludingAssessedTax","Revenues","SalesRevenueNet","SalesRevenueGoodsNet"], netIncome:["NetIncomeLoss","ProfitLoss"], operatingCashFlow:["NetCashProvidedByUsedInOperatingActivities"], cash:["CashAndCashEquivalentsAtCarryingValue","CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], assets:["Assets"], liabilities:["Liabilities"] };
function metric(facts,candidates){
 for(const tag of candidates){const concept=facts?.facts?.["us-gaap"]?.[tag];if(!concept)continue;const units=concept.units||{};const unit=Object.keys(units).find(x=>x==="USD")||Object.keys(units)[0];if(!unit)continue;
  const obs=(units[unit]||[]).filter(x=>["10-Q","10-K","20-F","40-F"].includes(x.form)&&x.end&&Number.isFinite(Number(x.val))).sort((a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed));if(!obs.length)continue;const latest=obs[0];let prior=null;
  if(latest.start){const duration=Date.parse(latest.end)-Date.parse(latest.start);prior=obs.find(x=>x.start&&Math.abs((Date.parse(x.end)-Date.parse(x.start))-duration)<4*86400000&&Math.abs((Date.parse(latest.end)-Date.parse(x.end))-365*86400000)<18*86400000)||null;}else prior=obs.find(x=>!x.start&&Math.abs((Date.parse(latest.end)-Date.parse(x.end))-365*86400000)<18*86400000)||null;
  return {label:concept.label||tag,tag,unit,latest:{value:latest.val,start:latest.start||null,end:latest.end,form:latest.form,filed:latest.filed,accession:latest.accn},prior:prior?{value:prior.val,start:prior.start||null,end:prior.end,form:prior.form,filed:prior.filed}:null};
 }return null;
}
export async function companyData(cik,env){
 const padded=String(cik).replace(/\D/g,"").padStart(10,"0");const [facts,submissions]=await Promise.all([secJson(`${DATA_ROOT}/api/xbrl/companyfacts/CIK${padded}.json`,env,21600),secJson(`${DATA_ROOT}/submissions/CIK${padded}.json`,env,21600)]);
 const recent=submissions.filings?.recent||{};const idx=(recent.form||[]).findIndex((form,i)=>["10-Q","10-K","20-F","40-F"].includes(form)&&recent.primaryDocument?.[i]);
 const filing=idx<0?null:{form:recent.form[idx],filed:recent.filingDate[idx],period:recent.reportDate[idx],accession:recent.accessionNumber[idx],document:recent.primaryDocument[idx],url:`https://www.sec.gov/Archives/edgar/data/${Number(padded)}/${recent.accessionNumber[idx].replace(/-/g,"")}/${recent.primaryDocument[idx]}`};
 const metrics=Object.fromEntries(Object.entries(TAGS).map(([name,candidates])=>[name,metric(facts,candidates)]));const units=Object.values(metrics).filter(Boolean).map(x=>x.unit);
 return {company:{cik:padded,name:submissions.name||facts.entityName,ticker:submissions.tickers?.[0]||"",exchange:submissions.exchanges?.[0]||"",currency:units.includes("USD")?"USD":units[0]||""},filing,metrics,source:`https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`};
}
export function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=300"}});}
