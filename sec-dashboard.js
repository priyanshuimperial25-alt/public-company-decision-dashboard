// Connects the static dashboard to the same-origin Cloudflare Pages Functions.
// These routes intentionally do not accept API keys or caller-supplied URLs.
const secPanel = () => document.getElementById('lookupPanel');
function secAmount(metric, currency) {
  if (!metric || metric.latest?.value == null) return 'Not reported / not available';
  const value = Number(metric.latest.value);
  if (!Number.isFinite(value)) return 'Not available';
  const unit = metric.unit || currency || '';
  const abs = Math.abs(value);
  const amount = abs >= 1e12 ? (value / 1e12).toFixed(2) + ' tn' : abs >= 1e9 ? (value / 1e9).toFixed(2) + ' bn' : abs >= 1e6 ? (value / 1e6).toFixed(2) + ' m' : value.toLocaleString();
  return `${unit} ${amount}`;
}
function secComparison(metric, currency) {
  if (!metric?.latest) return 'Not available';
  let out = `${metric.latest.form} · period ended ${metric.latest.end}`;
  if (metric.prior && Number(metric.prior.value) !== 0) {
    const growth = (Number(metric.latest.value) / Number(metric.prior.value) - 1) * 100;
    if (Number.isFinite(growth)) out += ` · ${growth >= 0 ? '+' : ''}${growth.toFixed(1)}% vs comparable prior-year period`;
  } else out += ' · comparable prior-year value unavailable';
  return out;
}
function secPeriod(m) { return m?.latest ? `${m.latest.form} · ended ${m.latest.end} · filed ${m.latest.filed}` : 'Unavailable'; }
function secRecord(data) {
  const c = data.company || {}, m = data.metrics || {}, filing = data.filing;
  const currency = c.currency || 'reported units';
  const facts = [['Revenue',m.revenue],['Net income',m.netIncome],['Operating cash flow',m.operatingCashFlow],['Cash & equivalents',m.cash],['Total assets',m.assets],['Total liabilities',m.liabilities]];
  const report = filing ? `${filing.form} · period ended ${filing.period || 'date not reported'}` : 'No recent 10-Q/10-K filing found';
  const growth = facts.filter(([_,x])=>x?.latest && x.prior && x.prior.value!==0).slice(0,4).map(([n,x])=>[`${n} · comparable period`,Number(((x.latest.value/x.prior.value)-1)*100).toFixed(1)]);
  const rows = facts.map(([n,x])=>[n,secAmount(x,currency),secComparison(x,currency)]);
  const source = filing?.url || `https://www.sec.gov/edgar/browse/?CIK=${encodeURIComponent(c.cik)}&owner=exclude`;
  const unavailable = 'Not provided by SEC company-facts data';
  const favorable = facts.filter(([,x])=>x?.latest).length;
  return {
    symbol:c.ticker || `CIK ${c.cik}`, company:c.name || 'SEC registrant', exchange:c.exchange || 'SEC EDGAR filer', currency,
    period:report, price:null, priceDate:'No live quote in the free SEC-only connection', priceUrl:source,
    recommendation:'NOT RATED', score:50, dynamicNoDecision:true,
    signalWhy:'SEC filings provide reported fundamentals, but this free connection has no live price, valuation multiples, forecasts, or investor-specific inputs. No buy/sell/hold signal is calculated.',
    kpis:facts.map(([n,x])=>[n,secAmount(x,currency),x?.latest?secPeriod(x):'Unavailable in reported XBRL tags']),
    segments:[], growth:growth.map(([n,v])=>[n,Number(v)]), factors:[['Reported data coverage',favorable?50:0,`${favorable} of 6 headline fields were available; this is coverage, not investment quality.`]],
    risks:[
      ['Price and valuation missing','SEC fundamentals do not include a live share price or current valuation multiples. A transparent valuation conclusion cannot be made.','high'],
      ['Coverage depends on issuer tagging',`This report maps standard US-GAAP tags. Filing-specific or non-US-GAAP line items may not be captured. ${unavailable}.`,'medium'],
      ['Management narrative needs review',filing?`Open the ${filing.form} filing and review Management’s Discussion and Analysis; the SEC XBRL facts are structured numbers, not a management-call transcript.`:'No recent periodic filing was located in the SEC submission feed.','medium']
    ],
    financial:rows, sources:[['Latest SEC filing',source],['SEC company facts',data.source],['SEC issuer filings',`https://www.sec.gov/edgar/browse/?CIK=${encodeURIComponent(c.cik)}&owner=exclude`]],
    qualityNote:`Source: SEC EDGAR. ${filing?`Latest periodic filing ${filing.form}, filed ${filing.filed}, for period ended ${filing.period || 'not stated'}.`:'No latest 10-Q/10-K filing metadata available.'} Values use SEC reported units; YoY comparison is shown only when a matching duration approximately one year earlier was found. The API does not provide live share price, analyst forecasts, or all issuer-specific KPIs.`,
    segmentNote:'Segment / business-line figures are not included in this standard-tag summary. Open the filing for issuer-specific segment disclosures.',
    riskNote:'These are data and research limitations, not estimated probabilities of loss.',
    commentary:filing?`SEC filing located: ${filing.form}, filed ${filing.filed}, period ended ${filing.period || 'not stated'}. Open the filing source above and review MD&A, liquidity, guidance and risk factors. The free structured-data connection does not summarize narrative or earnings-call tone.`:'No recent periodic filing was returned. Search the SEC filings link before relying on this view.',
    advancedFinancial:`The page maps SEC XBRL revenue, net income, operating cash flow, cash, total assets and total liabilities when standard concepts are available. Revenue YoY is compared only against an approximately same-duration prior-year fact. ${m.revenue?.latest?`Revenue reported as ${secAmount(m.revenue,currency)}; ${secComparison(m.revenue,currency)}.`:'Revenue is unavailable in the mapped facts.'} No DCF, peer valuation, leverage adjustment, or fair value is produced because price/market-cap and forecast inputs are absent.`,
    outlook:'Evidence-only outlook: compare reported revenue, profitability, operating cash flow and balance-sheet facts with the issuer’s MD&A and subsequent filings. Bull/base/bear cases and a price target require explicit operating assumptions and valuation inputs, so this SEC-only view does not invent them.'
  };
}
const staticDashboardShow = window.show;
window.show = function(d) {
  staticDashboardShow(d);
  if (d.dynamicNoDecision) {
    document.getElementById('price').textContent = 'Unavailable · SEC has no quote data';
    document.getElementById('recommendation').textContent = 'NOT RATED';
    document.getElementById('score').textContent = '—';
    document.getElementById('signal').textContent = 'NOT RATED';
    document.getElementById('factors').innerHTML = '<div class="callout">No buy/sell/hold score: the free SEC source has no current price, valuation, or forecast data.</div>';
  }
};
window.lookupCompany = async function lookupCompany() {
  const q=document.getElementById('companyQuery').value.trim(), p=secPanel();
  if(!q){alert('Enter a company name or ticker.');return;}
  p.classList.remove('hide');p.innerHTML=`<b>Searching SEC EDGAR for “${esc(q)}”…</b><p class="method">Free official filing data; coverage is limited to SEC registrants.</p>`;
  try{
    const response=await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if(!response.ok)throw new Error(response.status===404?'This host does not run the SEC data service yet. Deploy this project to Cloudflare Pages using DEPLOY-SEC.txt.':'SEC lookup service is not deployed or is unavailable.');
    const result=await response.json();if(result.error)throw new Error(result.error);
    if(!result.companies?.length){p.innerHTML=`<b>No SEC issuer matched “${esc(q)}”.</b><p class="method">Try an exact ticker or legal name. This free route does not cover every global listing.</p>`;return;}
    p.innerHTML=`<div class="section-title"><h3>Select the SEC issuer</h3><small>${esc(result.coverage)}</small></div><div class="bars">${result.companies.map(c=>`<button class="btn" style="text-align:left" onclick="loadSecCompany('${esc(c.cik)}')"><b>${esc(c.name)}</b> · ${esc(c.ticker)} · ${esc(c.exchange)} · CIK ${esc(c.cik)}</button>`).join('')}</div><div class="source">Prices and valuations are not part of this free SEC feed. The dashboard will say “Not rated” until those inputs are available.</div>`;
  }catch(e){p.innerHTML=`<b>SEC lookup isn’t connected yet.</b><p class="method">${esc(e.message)}</p><p class="source">For a live connection, deploy the project’s Functions to Cloudflare Pages and set SEC_USER_AGENT. See <a href="DEPLOY-SEC.txt" target="_blank" rel="noopener">setup instructions</a>.</p>`;}
};
window.loadSecCompany = async function loadSecCompany(cik){
  const p=secPanel();p.classList.remove('hide');p.innerHTML='<b>Loading SEC company facts and filing metadata…</b>';
  try{
    const response=await fetch(`/api/company/${encodeURIComponent(cik)}`);
    if(!response.ok)throw new Error('SEC company data service is not deployed or is temporarily unavailable.');
    const data=await response.json();if(data.error)throw new Error(data.error);
    const record=secRecord(data);show(record);
    document.getElementById('price').textContent='Unavailable · SEC has no quote data';
    document.getElementById('priceDate').textContent=record.priceDate;
    document.getElementById('recommendation').textContent='NOT RATED';
    document.getElementById('score').textContent='—';
    document.getElementById('signal').textContent='NOT RATED';
    document.getElementById('signalWhy').textContent=record.signalWhy;
    document.getElementById('factors').innerHTML='<div class="callout">No buy/sell/hold score: the free SEC source has no current price, valuation, or forecast data.</div>';
    p.innerHTML=`<b>Showing SEC data for ${esc(record.company)} (${esc(record.symbol)}).</b> <span class="method">Filing-based data; check each period and source link.</span>`;
    window.scrollTo({top:0,behavior:'smooth'});
  }catch(e){p.innerHTML=`<b>Could not load this issuer.</b><p class="method">${esc(e.message)}</p><p class="source">Check Cloudflare Pages deployment and the SEC_USER_AGENT setting in <a href="DEPLOY-SEC.txt" target="_blank" rel="noopener">setup instructions</a>.</p>`;}
};
