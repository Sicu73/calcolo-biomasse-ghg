const DATA = window.UNI11567_DATA || { metadata: {}, matrices: [], standardRows: [] };
const STANDARD_ROWS = [];
let lastFiliera = "";
let lastDigestato = "";
DATA.standardRows.forEach((row) => {
  if(row.filiera && row.filiera !== "Filiera") lastFiliera = row.filiera;
  if(row.digestato) lastDigestato = row.digestato;
  if(row.offgas && row.filiera !== "Filiera"){
    STANDARD_ROWS.push({ ...row, filiera: row.filiera || lastFiliera, digestato: row.digestato || lastDigestato });
  }
});

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n, d = 2) => Number.isFinite(n) ? n.toLocaleString("it-IT", { maximumFractionDigits: d, minimumFractionDigits: d }) : "-";
const fmt0 = (n) => Number.isFinite(n) ? Math.round(n).toLocaleString("it-IT") : "-";
const num = (id) => Number($(id).value || 0);

const factorDefaults = {
  dieselKgCO2eL: 2.68,
  electricityKgCO2eKwh: 0.32,
  methaneMjM3: 35.85
};

function categoryLabel(cat){
  return {
    coltura: "Coltura energetica",
    effluente: "Effluente / fanghi",
    forsu: "FORSU",
    sottoprodotti: "Residui / sottoprodotti"
  }[cat] || cat;
}

function selectedMatrix(){
  return DATA.matrices.find((m) => m.id === $("matrixSelect").value) || DATA.matrices[0];
}

const FILIERA_STOPWORDS = ["configurazione", "base", "rinnovabile", "insilato", "contenuto", "umidita", "umidit", "sottoprodotti"];

function filieraTokens(text){
  return String(text || "")
    .toLowerCase()
    .replace(/[àáâä]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i").replace(/[òóôö]/g, "o").replace(/[ùúûü]/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 4 && !FILIERA_STOPWORDS.includes(t));
}

function tokensMatch(a, b){
  return a === b
    || (a.length >= 4 && b.includes(a))
    || (b.length >= 4 && a.includes(b))
    || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));
}

function filieraScore(matrixTokens, filiera){
  const tokens = filieraTokens(filiera);
  return matrixTokens.reduce((score, m) => score + (tokens.some((f) => tokensMatch(m, f)) ? 1 : 0), 0);
}

// Aggancia la matrice alla filiera UNI per sovrapposizione di token: niente elenco fisso di colture da mantenere.
function standardCandidates(matrix){
  const matrixTokens = filieraTokens(matrix.name);
  const digestate = $("digestate").value;
  const offgas = $("offgas").value;
  return STANDARD_ROWS
    .filter((row) => String(row.digestato || "").includes(digestate) && String(row.offgas || "") === offgas)
    .map((row) => ({ row, score: filieraScore(matrixTokens, row.filiera) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.row);
}

function selectedStandard(matrix){
  const rows = standardCandidates(matrix);
  return rows.find((r) => Number.isFinite(Number(r.tot_altri_80_M))) || rows[0] || null;
}

function evidenceComplete(matrix){
  const ecOk = matrix.category !== "coltura" || $("docEc").files.length > 0;
  const creditOk = matrix.category !== "effluente" || $("avoidedScenario").value === "none" || $("docCredit").files.length > 0;
  const transportOk = $("docTransport").files.length > 0;
  return { ecOk, creditOk, transportOk, complete: ecOk && creditOk && transportOk };
}

function tracePayload(result){
  return {
    progetto: $("projectCode").value,
    fornitore: $("supplierName").value,
    campagna: Number($("campaignYear").value),
    fonteWorkbook: DATA.metadata.sourceWorkbook,
    sourceWorkbookSha256: DATA.metadata.sourceWorkbookSha256,
    fontePdf: DATA.metadata.sourcePdf,
    matrice: result.matrix.name,
    categoria: categoryLabel(result.matrix.category),
    rigaStandard: result.standard ? {
      row: result.standard.row,
      filiera: result.standard.filiera,
      digestato: result.standard.digestato,
      offgas: result.standard.offgas,
      ec: result.standard.ec,
      ep: result.standard.ep,
      etd: result.standard.etd,
      crediti: result.standard.crediti,
      totale: result.standardTotal
    } : null,
    formuleLotto: {
      pesoNormalizzato: "quantita_t * ST_reale / ST_riferimento",
      energiaMJ: "peso_normalizzato_t * MJ_kg_tq * 1000",
      ec: "(N*fattoreN + gasolio*fattoreGasolio + elettricita*fattoreElettrico) * 1000 / energia_MJ_ha",
      etd: "tonnellate * km * fattore_mezzo * 1000 / energia_MJ_lotto",
      credito: "scenario != none ? -(tonnellate * kgCO2e_t_evitati) * 1000 / energia_MJ_lotto : 0",
      confrontoFornitura: "delta = (ec+etd+credito)_puntuale - (ec+etd+crediti)_standard [gCO2e/MJ biometano]; ep di processo escluso (compete all'impianto)"
    },
    coefficienti: {
      fattoreN_kgCO2e_kgN: result.factorN,
      gasolio_kgCO2e_L: result.dieselFactor,
      elettricita_kgCO2e_kWh: result.electricityFactor,
      trasporto_kgCO2e_tkm: result.transportFactor,
      pcMetano_MJ_m3: factorDefaults.methaneMjM3,
      nota: "Valori predefiniti indicativi: verificare e documentare la fonte (RED II / banche dati nazionali) prima dell'uso certificabile."
    },
    scenarioCredito: result.avoidedScenario,
    risultati: {
      pesoNormalizzatoT: result.normTon,
      energiaMj: result.energyMj,
      metanoM3: result.methaneM3,
      ec: result.ec,
      etd: result.etd,
      credito: result.credit,
      sottototaleFornituraPuntuale: result.punctualTotal,
      standardEc: result.stdEc,
      standardEtd: result.stdEtd,
      standardCrediti: result.stdCred,
      standardEp: result.stdEp,
      sottototaleFornituraStandard: result.standardSupplyTotal,
      totaleFilieraStandardCalore: result.standardTotal,
      deltaFornituraVsStandard: result.supplyDelta
    },
    evidenze: result.evidence
  };
}

function row(label, value){
  return `<div class="trace-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function evidenceChip(label, ok){
  return `<div class="evidence-chip ${ok ? "ok" : ""}">${esc(label)}: ${ok ? "OK" : "manca"}</div>`;
}

function renderTrace(result){
  const trace = tracePayload(result);
  const standard = trace.rigaStandard;
  const formulas = trace.formuleLotto;
  const rawJson = JSON.stringify(trace, null, 2);
  $("traceBox").innerHTML = `
    <div class="trace-card">
      <h3>Fonte dati</h3>
      <div class="trace-list">
        ${row("Pratica", trace.progetto)}
        ${row("Fornitore", trace.fornitore)}
        ${row("Workbook", trace.fonteWorkbook)}
        ${row("Hash workbook", trace.sourceWorkbookSha256)}
        ${row("PDF UNI", trace.fontePdf)}
      </div>
    </div>

    <div class="trace-card">
      <h3>Standard UNI selezionato</h3>
      <div class="trace-list">
        ${row("Matrice", trace.matrice)}
        ${row("Categoria", trace.categoria)}
        ${row("Riga workbook", standard ? standard.row : "n/d")}
        ${row("Filiera", standard ? standard.filiera : "n/d")}
        ${row("Digestato", standard ? standard.digestato : "n/d")}
        ${row("Off-gas", standard ? standard.offgas : "n/d")}
        ${row("Tot. filiera UNI (MJ calore)", Number.isFinite(trace.risultati.totaleFilieraStandardCalore) ? `${fmt(trace.risultati.totaleFilieraStandardCalore, 2)} gCO2e/MJ` : "n/d")}
        ${row("ep processo UNI (impianto)", trace.risultati.standardEp === null ? "n/d" : `${fmt(trace.risultati.standardEp, 2)} gCO2e/MJ`)}
        ${row("Sotto-tot. fornitura UNI", trace.risultati.sottototaleFornituraStandard === null ? "n/d" : `${fmt(trace.risultati.sottototaleFornituraStandard, 2)} gCO2e/MJ`)}
      </div>
    </div>

    <div class="trace-card">
      <h3>Risultati puntuali</h3>
      <div class="trace-list">
        ${row("Peso normalizzato", `${fmt(trace.risultati.pesoNormalizzatoT, 2)} t`)}
        ${row("Energia lotto", `${fmt0(trace.risultati.energiaMj)} MJ`)}
        ${row("Metano stimato", `${fmt0(trace.risultati.metanoM3)} m3 CH4`)}
        ${row("ec coltivazione", `${fmt(trace.risultati.ec, 3)} gCO2e/MJ`)}
        ${row("etd trasporto", `${fmt(trace.risultati.etd, 3)} gCO2e/MJ`)}
        ${row("Credito", `${fmt(trace.risultati.credito, 3)} gCO2e/MJ`)}
        ${row("Sotto-totale fornitura", `${fmt(trace.risultati.sottototaleFornituraPuntuale, 3)} gCO2e/MJ`)}
      </div>
    </div>

    <div class="trace-card full">
      <h3>Confronto lato fornitura (gCO2e/MJ biometano)</h3>
      <div class="trace-list">
        ${row("ec puntuale / UNI", `${fmt(trace.risultati.ec, 2)}  /  ${trace.risultati.standardEc === null ? "n/d" : fmt(trace.risultati.standardEc, 2)}`)}
        ${row("etd puntuale / UNI", `${fmt(trace.risultati.etd, 2)}  /  ${trace.risultati.standardEtd === null ? "n/d" : fmt(trace.risultati.standardEtd, 2)}`)}
        ${row("credito puntuale / UNI", `${fmt(trace.risultati.credito, 2)}  /  ${trace.risultati.standardCrediti === null ? "n/d" : fmt(trace.risultati.standardCrediti, 2)}`)}
        ${row("Delta fornitura vs UNI", trace.risultati.deltaFornituraVsStandard === null ? "n/d" : `${fmt(trace.risultati.deltaFornituraVsStandard, 2)} gCO2e/MJ`)}
        ${row("Nota", "ep di processo/upgrading escluso dal confronto: compete all'impianto, non al fornitore")}
      </div>
    </div>

    <div class="trace-card">
      <h3>Coefficienti applicati</h3>
      <div class="trace-list">
        ${row("Fattore N", `${fmt(trace.coefficienti.fattoreN_kgCO2e_kgN, 2)} kgCO2e/kg N`)}
        ${row("Gasolio", `${fmt(trace.coefficienti.gasolio_kgCO2e_L, 2)} kgCO2e/L`)}
        ${row("Energia elettrica", `${fmt(trace.coefficienti.elettricita_kgCO2e_kWh, 3)} kgCO2e/kWh`)}
        ${row("Trasporto", `${fmt(trace.coefficienti.trasporto_kgCO2e_tkm, 3)} kgCO2e/tkm`)}
        ${row("PC metano", `${fmt(trace.coefficienti.pcMetano_MJ_m3, 2)} MJ/m3`)}
        ${row("Fonte", "predefiniti indicativi - documentare la fonte")}
      </div>
    </div>

    <div class="trace-card">
      <h3>Evidenze</h3>
      <div class="evidence-list">
        ${evidenceChip("ec", trace.evidenze.ecOk)}
        ${evidenceChip("trasporto", trace.evidenze.transportOk)}
        ${evidenceChip("credito", trace.evidenze.creditOk)}
        ${evidenceChip("profilo", trace.evidenze.complete)}
      </div>
    </div>

    <div class="trace-card full">
      <h3>Formule applicate</h3>
      <div class="trace-formulas">
        ${Object.entries(formulas).map(([name, formula]) => `<div class="formula"><span>${esc(name)}</span><code>${esc(formula)}</code></div>`).join("")}
      </div>
    </div>

    <details class="trace-raw">
      <summary>Traccia tecnica interna</summary>
      <pre>${esc(rawJson)}</pre>
    </details>
  `;
}

function calculate(){
  const matrix = selectedMatrix();
  if(!matrix) return null;

  const quantityT = num("quantityT");
  const realStPct = num("realSt");
  const realSt = realStPct / 100;
  const refSt = Number(matrix.st || 0);
  const methaneM3T = Number(matrix.methane_m3_ttq || 0);
  const mjKgTq = Number(matrix.mj_kg_tq || 0);
  const normTon = refSt > 0 ? quantityT * realSt / refSt : 0;
  const energyMj = mjKgTq > 0 ? normTon * mjKgTq * 1000 : normTon * methaneM3T * factorDefaults.methaneMjM3;
  const methaneM3 = methaneM3T > 0 ? normTon * methaneM3T : energyMj / factorDefaults.methaneMjM3;
  const standard = selectedStandard(matrix);
  const standardTotal = Number(standard?.tot_altri_80_M ?? standard?.tot_altri_80_O ?? standard?.tot_liq);
  const stdNum = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
  const stdEc = stdNum(standard?.ec);
  const stdEtd = stdNum(standard?.etd);
  const stdCred = stdNum(standard?.crediti);
  const stdEp = stdNum(standard?.ep);

  const yieldTha = Math.max(num("yieldTha"), 0.0001);
  const nitrogenKgHa = num("nitrogenKgHa");
  const dieselLHa = num("dieselLHa");
  const electricityKwhHa = num("electricityKwhHa");
  const factorN = num("factorN");
  const dieselFactor = num("dieselFactor") || factorDefaults.dieselKgCO2eL;
  const electricityFactor = num("electricityFactor") || factorDefaults.electricityKgCO2eKwh;
  const energyMjHa = Math.max(yieldTha * Math.max(mjKgTq, 0.001) * 1000, 0.0001);
  const ec = matrix.category === "coltura"
    ? (nitrogenKgHa * factorN + dieselLHa * dieselFactor + electricityKwhHa * electricityFactor) * 1000 / energyMjHa
    : 0;

  const transportFactor = num("transportFactor");
  const etd = energyMj > 0
    ? (quantityT * num("distanceKm") * transportFactor) * 1000 / energyMj
    : 0;

  const avoidedScenario = $("avoidedScenario").value;
  const credit = (matrix.category === "effluente" && avoidedScenario !== "none")
    ? -(quantityT * num("avoidedKgT")) * 1000 / Math.max(energyMj, 0.0001)
    : 0;

  const punctualTotal = ec + etd + credit;
  const standardSupplyTotal = standard ? (stdEc || 0) + (stdEtd || 0) + (stdCred || 0) : null;
  const supplyDelta = (standardSupplyTotal !== null) ? punctualTotal - standardSupplyTotal : null;
  const evidence = evidenceComplete(matrix);
  const status = evidence.complete ? "Evidenze allegate" : "Evidenze incomplete";

  return { matrix, quantityT, realSt, refSt, normTon, energyMj, methaneM3, standard, standardTotal, stdEc, stdEtd, stdCred, stdEp, avoidedScenario, ec, etd, credit, punctualTotal, standardSupplyTotal, supplyDelta, factorN, dieselFactor, electricityFactor, transportFactor, evidence, status };
}

function render(){
  const result = calculate();
  if(!result) return;
  const { matrix, standard, evidence } = result;

  $("kMatrices").textContent = DATA.matrices.length;
  $("kStandards").textContent = DATA.standardRows.length.toLocaleString("it-IT");
  $("kStatus").textContent = result.status;
  $("kPunctual").textContent = `${fmt(result.punctualTotal, 1)} gCO2e/MJ`;

  $("matrixCategory").textContent = categoryLabel(matrix.category);
  $("refSt").value = fmt(result.refSt * 100, 1) + " %";
  $("mjKg").value = fmt(Number(matrix.mj_kg_tq || 0), 3);
  $("normTon").textContent = `${fmt0(result.normTon)} t`;
  $("energyMj").textContent = `${fmt0(result.energyMj)} MJ`;
  $("methaneM3").textContent = `${fmt0(result.methaneM3)} m3 CH4`;
  $("standardTotal").textContent = Number.isFinite(result.standardTotal) ? `${fmt(result.standardTotal, 1)} gCO2e/MJ` : "n/d";
  $("standardSupply").textContent = (result.standardSupplyTotal !== null) ? `${fmt(result.standardSupplyTotal, 2)} gCO2e/MJ` : "n/d";
  $("supplyDelta").textContent = (result.supplyDelta !== null) ? `${fmt(result.supplyDelta, 2)} gCO2e/MJ` : "n/d";

  $("ecOut").textContent = `${fmt(result.ec, 2)} gCO2e/MJ`;
  $("etdOut").textContent = `${fmt(result.etd, 2)} gCO2e/MJ`;
  $("creditOut").textContent = `${fmt(result.credit, 2)} gCO2e/MJ`;

  $("evidenceStatus").textContent = evidence.complete ? "Evidenze allegate" : "Evidenze incomplete";
  $("evidenceStatus").className = evidence.complete ? "tag" : "tag warn";

  renderTrace(result);
}

function renderCatalog(){
  $("matrixSelect").innerHTML = DATA.matrices.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
  $("matrixRows").innerHTML = DATA.matrices.map((m) => `
    <tr>
      <td>${m.name}</td>
      <td>${categoryLabel(m.category)}</td>
      <td>${fmt(Number(m.st || 0) * 100, 1)}%</td>
      <td>${fmt(Number(m.methane_m3_ttq || 0), 2)}</td>
      <td>${fmt(Number(m.mj_kg_tq || 0), 3)}</td>
      <td>${m.source || ""}</td>
    </tr>
  `).join("");
}

function profilePayload(){
  const r = calculate();
  return {
    schema: "it.sicu73.ghg-puntuali.profile.v1",
    exportedAt: new Date().toISOString(),
    project: {
      code: $("projectCode").value,
      supplier: $("supplierName").value,
      campaignYear: Number($("campaignYear").value),
      lotPeriod: $("lotPeriod").value
    },
    source: DATA.metadata,
    profile: {
      profileId: `${$("supplierName").value}-${r.matrix.id}-${$("campaignYear").value}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      supplierName: $("supplierName").value,
      matrixId: r.matrix.id,
      matrixName: r.matrix.name,
      category: r.matrix.category,
      digestate: $("digestate").value,
      offgas: $("offgas").value,
      quantityT: r.quantityT,
      realSt: r.realSt,
      referenceSt: r.refSt,
      normalizedT: r.normTon,
      energyMj: r.energyMj,
      methaneM3: r.methaneM3,
      avoidedScenario: r.avoidedScenario,
      standardTotalHeat: r.standardTotal,
      standardSupplyTotal: r.standardSupplyTotal,
      supplyDelta: r.supplyDelta,
      punctual: { ec: r.ec, etd: r.etd, credit: r.credit, supplyTotal: r.punctualTotal },
      standard: { ec: r.stdEc, etd: r.stdEtd, credit: r.stdCred, ep: r.stdEp },
      evidence: r.evidence,
      status: r.evidence.complete ? "evidence-attached" : "blocked-missing-evidence"
    }
  };
}

function download(name, text, type){
  const blob = text instanceof Blob ? text : new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function reportPayload(){
  const result = calculate();
  return {
    generatedAt: new Date(),
    profile: profilePayload(),
    result,
    trace: tracePayload(result)
  };
}

function cleanFileName(value){
  return String(value || "report-ghg-puntuale").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report-ghg-puntuale";
}

function reportCell(value){
  return value === null || value === undefined || value === "" ? "n/d" : esc(value);
}

function reportRows(rows){
  return rows.map(([label, value]) => `<tr><th>${esc(label)}</th><td>${reportCell(value)}</td></tr>`).join("");
}

function reportMetric(label, value, tone = ""){
  return `<div class="metric ${tone}"><span>${esc(label)}</span><strong>${reportCell(value)}</strong></div>`;
}

function reportSection(title, rows){
  return `
    <section class="report-section">
      <h2>${esc(title)}</h2>
      <table>${reportRows(rows)}</table>
    </section>
  `;
}

function reportHtml(payload, mode = "pdf"){
  const { trace, result, profile } = payload;
  const generated = payload.generatedAt.toLocaleString("it-IT");
  const standard = trace.rigaStandard || {};
  const evidence = trace.evidenze || {};
  const formulas = trace.formuleLotto || {};
  const deltaTone = Number.isFinite(result.supplyDelta) && result.supplyDelta <= 0 ? "good" : "warn";
  const methodNote = "Standard, rese e righe di confronto sono derivati dal workbook UNI fornito. Le formule puntuali operative ec/etd/credito sono una struttura tecnica da validare rispetto alla UNI/TS 11567:2024 prima di uso certificabile.";
  const formulasTable = Object.entries(formulas).map(([name, formula]) => `<tr><th>${esc(name)}</th><td><code>${esc(formula)}</code></td></tr>`).join("");
  const appLink = `${location.origin}${location.pathname}`;

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>Report GHG puntuale - ${esc(trace.progetto)}</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#f4f1ea;color:#222;font-family:Arial,"Segoe UI",sans-serif;line-height:1.42}
    .page{max-width:1120px;margin:0 auto;padding:28px}
    .report-head{background:#10251f;color:#fff;border-bottom:6px solid #16795b;padding:24px 28px;border-radius:10px 10px 0 0}
    .report-head h1{margin:0;font-size:28px;letter-spacing:0}
    .report-head p{margin:6px 0 0;color:#c8ded6;font-size:13px}
    .toolbar{display:flex;gap:10px;justify-content:flex-end;background:#fff;border:1px solid #d9d5ca;border-top:0;padding:12px 18px}
    .toolbar button{border:0;border-radius:6px;background:#16795b;color:#fff;padding:10px 14px;font-weight:700;cursor:pointer}
    .sheet{background:#fff;border:1px solid #d9d5ca;border-top:0;padding:22px 28px 30px;border-radius:0 0 10px 10px}
    .meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}
    .metric{border:1px solid #d9d5ca;border-top:4px solid #1f6ca8;border-radius:8px;padding:12px;background:#fbfaf7}
    .metric span{display:block;color:#62665f;font-size:11px;text-transform:uppercase;font-weight:800}
    .metric strong{display:block;margin-top:5px;font-size:20px;color:#1f3140}
    .metric.good{border-top-color:#16795b}
    .metric.warn{border-top-color:#947018}
    .report-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .report-section{border:1px solid #d9d5ca;border-radius:8px;overflow:hidden;background:#fff;margin-bottom:16px}
    .report-section h2{margin:0;padding:10px 12px;background:#e4f4ee;color:#16795b;font-size:13px;text-transform:uppercase;letter-spacing:.7px}
    table{width:100%;border-collapse:collapse;font-size:12.5px}
    th,td{border-top:1px solid #e8e3d8;padding:8px 10px;text-align:left;vertical-align:top}
    th{width:34%;color:#62665f;background:#fbfaf7;font-weight:800}
    code{font-family:Consolas,monospace;font-size:11.5px;color:#24352f}
    .note{border-left:4px solid #947018;background:#fbf0d2;border-radius:6px;padding:12px 14px;font-size:12.5px;margin:2px 0 16px}
    .small{font-size:11px;color:#62665f;margin-top:14px}
    @media print{
      body{background:#fff}
      .page{max-width:none;padding:0}
      .toolbar{display:none}
      .report-head,.sheet,.report-section,.metric{border-radius:0}
      .report-section,.metric{break-inside:avoid}
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="report-head">
      <h1>Report GHG puntuale biomasse</h1>
      <p>${esc(trace.progetto)} - ${esc(trace.fornitore)} - generato il ${esc(generated)}</p>
    </header>
    ${mode === "pdf" ? `<div class="toolbar"><button onclick="window.print()">Salva / stampa PDF</button></div>` : ""}
    <main class="sheet">
      <div class="meta">
        ${reportMetric("Matrice", trace.matrice)}
        ${reportMetric("Fornitura puntuale", `${fmt(result.punctualTotal, 2)} gCO2e/MJ`, deltaTone)}
        ${reportMetric("Fornitura UNI", result.standardSupplyTotal === null ? "n/d" : `${fmt(result.standardSupplyTotal, 2)} gCO2e/MJ`)}
        ${reportMetric("Delta vs UNI", result.supplyDelta === null ? "n/d" : `${fmt(result.supplyDelta, 2)} gCO2e/MJ`, deltaTone)}
      </div>
      <div class="note">${esc(methodNote)}</div>
      <div class="report-grid">
        ${reportSection("Pratica", [
          ["Codice pratica", trace.progetto],
          ["Fornitore", trace.fornitore],
          ["Campagna", trace.campagna],
          ["Periodo lotto", profile.project.lotPeriod],
          ["Stato evidenze", result.status]
        ])}
        ${reportSection("Fonte dati", [
          ["Workbook", trace.fonteWorkbook],
          ["Hash workbook", trace.sourceWorkbookSha256],
          ["PDF UNI", trace.fontePdf],
          ["Software", appLink]
        ])}
        ${reportSection("Matrice e configurazione", [
          ["Matrice", trace.matrice],
          ["Categoria", trace.categoria],
          ["Digestato", standard.digestato || $("digestate").value],
          ["Off-gas", standard.offgas || $("offgas").value],
          ["Scenario credito", trace.scenarioCredito]
        ])}
        ${reportSection("Calcolo lotto", [
          ["Quantita tal quale", `${fmt(result.quantityT, 2)} t`],
          ["ST reale", `${fmt(result.realSt * 100, 2)} %`],
          ["ST riferimento", `${fmt(result.refSt * 100, 2)} %`],
          ["Peso normalizzato", `${fmt(result.normTon, 2)} t`],
          ["Energia lotto", `${fmt0(result.energyMj)} MJ`],
          ["Metano stimato", `${fmt0(result.methaneM3)} m3 CH4`]
        ])}
        ${reportSection("Riga standard UNI", [
          ["Riga workbook", standard.row],
          ["Filiera", standard.filiera],
          ["ec UNI", result.stdEc === null ? null : `${fmt(result.stdEc, 2)} gCO2e/MJ`],
          ["ep UNI impianto", result.stdEp === null ? null : `${fmt(result.stdEp, 2)} gCO2e/MJ`],
          ["etd UNI", result.stdEtd === null ? null : `${fmt(result.stdEtd, 2)} gCO2e/MJ`],
          ["crediti UNI", result.stdCred === null ? null : `${fmt(result.stdCred, 2)} gCO2e/MJ`],
          ["Totale filiera UNI MJ calore", Number.isFinite(result.standardTotal) ? `${fmt(result.standardTotal, 2)} gCO2e/MJ` : null],
          ["Sotto-totale fornitura UNI", result.standardSupplyTotal === null ? null : `${fmt(result.standardSupplyTotal, 2)} gCO2e/MJ`]
        ])}
        ${reportSection("Risultati puntuali", [
          ["ec coltivazione", `${fmt(result.ec, 3)} gCO2e/MJ`],
          ["etd trasporto", `${fmt(result.etd, 3)} gCO2e/MJ`],
          ["credito effluenti", `${fmt(result.credit, 3)} gCO2e/MJ`],
          ["Sotto-totale fornitura", `${fmt(result.punctualTotal, 3)} gCO2e/MJ`],
          ["Delta fornitura vs UNI", result.supplyDelta === null ? null : `${fmt(result.supplyDelta, 3)} gCO2e/MJ`]
        ])}
        ${reportSection("Coefficienti applicati", [
          ["Fattore N", `${fmt(result.factorN, 2)} kgCO2e/kg N`],
          ["Gasolio", `${fmt(result.dieselFactor, 2)} kgCO2e/L`],
          ["Energia elettrica", `${fmt(result.electricityFactor, 3)} kgCO2e/kWh`],
          ["Trasporto", `${fmt(result.transportFactor, 3)} kgCO2e/tkm`],
          ["PC metano", `${fmt(factorDefaults.methaneMjM3, 2)} MJ/m3`],
          ["Fonte coefficienti", "predefiniti indicativi - documentare la fonte (RED II / banche dati nazionali)"]
        ])}
        ${reportSection("Evidenze", [
          ["ec", evidence.ecOk ? "OK" : "manca"],
          ["trasporto", evidence.transportOk ? "OK" : "manca"],
          ["credito", evidence.creditOk ? "OK" : "manca"],
          ["profilo completo", evidence.complete ? "OK" : "manca"]
        ])}
        <section class="report-section">
          <h2>Formule applicate</h2>
          <table>${formulasTable}</table>
        </section>
      </div>
      <p class="small">Nota: il confronto lato fornitura esclude ep di processo/upgrading, che compete all'impianto. Conservare le evidenze documentali insieme al report.</p>
    </main>
  </div>
</body>
</html>`;
}

function xmlEsc(value){
  return String(value ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));
}

function colName(index){
  let n = index;
  let name = "";
  while(n > 0){
    const mod = (n - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    n = Math.floor((n - mod) / 26);
  }
  return name;
}

function cellRef(row, col){
  return `${colName(col)}${row}`;
}

function xCell(value, style = 0){
  return { value, style };
}

function xNum(value, style = 6){
  return { value: Number.isFinite(value) ? value : null, style };
}

function xAuto(value, style = 5){
  return typeof value === "number" && Number.isFinite(value) ? xNum(value, 6) : xCell(value, style);
}

function xlsxCellXml(cell, rowIndex, colIndex){
  const data = cell && typeof cell === "object" && Object.prototype.hasOwnProperty.call(cell, "value")
    ? cell
    : xCell(cell);
  const ref = cellRef(rowIndex, colIndex);
  const style = Number.isFinite(data.style) ? ` s="${data.style}"` : "";
  if(data.value === null || data.value === undefined || data.value === ""){
    return `<c r="${ref}"${style}/>`;
  }
  if(typeof data.value === "number" && Number.isFinite(data.value)){
    return `<c r="${ref}"${style}><v>${data.value}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${style}><is><t>${xmlEsc(data.value)}</t></is></c>`;
}

function xlsxSheetXml(sheet){
  const maxCols = Math.max(...sheet.rows.map((rowData) => rowData.length), 1);
  const columns = (sheet.widths || []).map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("");
  const rows = sheet.rows.map((rowData, rIdx) => {
    const rowNumber = rIdx + 1;
    const height = sheet.heights?.[rowNumber] ? ` ht="${sheet.heights[rowNumber]}" customHeight="1"` : "";
    const cells = rowData.map((cell, cIdx) => xlsxCellXml(cell, rowNumber, cIdx + 1)).join("");
    return `<row r="${rowNumber}" spans="1:${maxCols}"${height}>${cells}</row>`;
  }).join("");
  const merges = (sheet.merges || []).length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${columns}</cols>
  <sheetData>${rows}</sheetData>
  ${merges}
  <pageMargins left="0.35" right="0.35" top="0.55" bottom="0.55" header="0.3" footer="0.3"/>
</worksheet>`;
}

function xlsxStylesXml(){
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
  <fonts count="7">
    <font><sz val="11"/><color rgb="FF232522"/><name val="Aptos"/></font>
    <font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><color rgb="FF16795B"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><color rgb="FF62665F"/><name val="Aptos"/></font>
    <font><b/><sz val="14"/><color rgb="FF1F3140"/><name val="Aptos"/></font>
    <font><sz val="10"/><color rgb="FF62665F"/><name val="Aptos"/></font>
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF10251F"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE4F4EE"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFBFAF7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F6CA8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFBF0D2"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF16795B"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD9D5CA"/></left><right style="thin"><color rgb="FFD9D5CA"/></right><top style="thin"><color rgb="FFD9D5CA"/></top><bottom style="thin"><color rgb="FFD9D5CA"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="12">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="6" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="5" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="5" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function buildXlsxSheets(payload){
  const { trace, result, profile } = payload;
  const evidence = trace.evidenze || {};
  const standard = trace.rigaStandard || {};
  const generated = payload.generatedAt.toLocaleString("it-IT");
  const deltaStyle = Number.isFinite(result.supplyDelta) && result.supplyDelta <= 0 ? 8 : 9;
  const summaryRows = [];
  const summaryMerges = [];
  const section = (title) => {
    const row = summaryRows.push([xCell(title, 3)]);
    summaryMerges.push(`A${row}:D${row}`);
  };
  const pair = (label, value, label2, value2) => summaryRows.push([
    xCell(label, 4), xAuto(value), xCell(label2 || "", 4), xAuto(value2 || "")
  ]);

  const titleRow = summaryRows.push([xCell("Report GHG puntuale biomasse", 1)]);
  summaryMerges.push(`A${titleRow}:D${titleRow}`);
  const subRow = summaryRows.push([xCell(`${trace.progetto} - ${trace.fornitore} - generato il ${generated}`, 2)]);
  summaryMerges.push(`A${subRow}:D${subRow}`);
  summaryRows.push([]);
  summaryRows.push([xCell("Matrice", 7), xCell("Fornitura puntuale", 7), xCell("Fornitura UNI", 7), xCell("Delta vs UNI", 7)]);
  summaryRows.push([
    xCell(trace.matrice, 8),
    xNum(result.punctualTotal, 8),
    result.standardSupplyTotal === null ? xCell("n/d", 8) : xNum(result.standardSupplyTotal, 8),
    result.supplyDelta === null ? xCell("n/d", deltaStyle) : xNum(result.supplyDelta, deltaStyle)
  ]);
  summaryRows.push([]);
  section("Pratica");
  pair("Codice pratica", trace.progetto, "Fornitore", trace.fornitore);
  pair("Campagna", trace.campagna, "Periodo lotto", profile.project.lotPeriod);
  pair("Stato evidenze", result.status, "Categoria", trace.categoria);
  summaryRows.push([]);
  section("Calcolo lotto");
  pair("Quantita tal quale (t)", result.quantityT, "ST reale (%)", result.realSt * 100);
  pair("ST riferimento (%)", result.refSt * 100, "Peso normalizzato (t)", result.normTon);
  pair("Energia lotto (MJ)", result.energyMj, "Metano stimato (m3 CH4)", result.methaneM3);
  summaryRows.push([]);
  section("Confronto standard UNI");
  pair("Riga workbook", standard.row || "n/d", "Filiera", standard.filiera || "n/d");
  pair("Digestato", standard.digestato || $("digestate").value, "Off-gas", standard.offgas || $("offgas").value);
  pair("ec UNI", result.stdEc, "etd UNI", result.stdEtd);
  pair("crediti UNI", result.stdCred, "ep processo UNI", result.stdEp);
  pair("Sotto-totale fornitura UNI", result.standardSupplyTotal, "Totale filiera UNI MJ calore", Number.isFinite(result.standardTotal) ? result.standardTotal : "n/d");
  summaryRows.push([]);
  section("Risultati puntuali");
  pair("ec coltivazione", result.ec, "etd trasporto", result.etd);
  pair("credito effluenti", result.credit, "Sotto-totale fornitura", result.punctualTotal);
  pair("Delta fornitura vs UNI", result.supplyDelta, "Scenario credito", trace.scenarioCredito);
  summaryRows.push([]);
  section("Coefficienti applicati");
  pair("Fattore N (kgCO2e/kg N)", result.factorN, "Gasolio (kgCO2e/L)", result.dieselFactor);
  pair("Energia elettrica (kgCO2e/kWh)", result.electricityFactor, "Trasporto (kgCO2e/tkm)", result.transportFactor);
  pair("PC metano (MJ/m3)", factorDefaults.methaneMjM3, "Fonte", "predefiniti - documentare la fonte");
  summaryRows.push([]);
  section("Evidenze");
  pair("ec", evidence.ecOk ? "OK" : "manca", "trasporto", evidence.transportOk ? "OK" : "manca");
  pair("credito", evidence.creditOk ? "OK" : "manca", "profilo completo", evidence.complete ? "OK" : "manca");
  summaryRows.push([]);
  const noteRow = summaryRows.push([xCell("Nota metodo: standard, rese e righe di confronto sono derivati dal workbook UNI fornito. Le formule puntuali operative ec/etd/credito sono una struttura tecnica da validare rispetto alla UNI/TS 11567:2024 prima di uso certificabile.", 11)]);
  summaryMerges.push(`A${noteRow}:D${noteRow}`);

  const formulasRows = [
    [xCell("Formule applicate", 1)],
    [],
    [xCell("Voce", 10), xCell("Formula", 10)]
  ];
  Object.entries(trace.formuleLotto || {}).forEach(([name, formula]) => formulasRows.push([xCell(name, 4), xCell(formula, 5)]));

  const catalogRows = [
    [xCell("Catalogo matrici UNI importate", 1)],
    [],
    [xCell("Matrice", 10), xCell("Categoria", 10), xCell("ST", 10), xCell("CH4 m3/t tq", 10), xCell("MJ/kg tq", 10), xCell("Fonte", 10)]
  ];
  DATA.matrices.forEach((m) => catalogRows.push([
    xCell(m.name, 5),
    xCell(categoryLabel(m.category), 5),
    xNum(Number(m.st || 0), 6),
    xNum(Number(m.methane_m3_ttq || 0), 6),
    xNum(Number(m.mj_kg_tq || 0), 6),
    xCell(m.source || "", 5)
  ]));

  return [
    { name: "Sintesi", rows: summaryRows, merges: summaryMerges, widths: [26, 32, 26, 32], heights: { 1: 28, 2: 22 } },
    { name: "Formule", rows: formulasRows, merges: ["A1:B1"], widths: [28, 95], heights: { 1: 28 } },
    { name: "Catalogo matrici", rows: catalogRows, merges: ["A1:F1"], widths: [34, 24, 12, 16, 14, 24], heights: { 1: 28 } }
  ];
}

function crc32(bytes){
  let crc = -1;
  for(const byte of bytes){
    crc ^= byte;
    for(let i = 0; i < 8; i += 1){
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function dosDateTime(date){
  const year = Math.max(date.getFullYear(), 1980);
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = (year - 1980) << 9 | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function u16(value){
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value){
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function concatBytes(parts){
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function zipStore(files){
  const encoder = new TextEncoder();
  const now = dosDateTime(new Date());
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.text);
    const crc = crc32(dataBytes);
    const local = concatBytes([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(now.time), u16(now.day),
      u32(crc), u32(dataBytes.length), u32(dataBytes.length), u16(nameBytes.length), u16(0), nameBytes, dataBytes
    ]);
    const central = concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(now.time), u16(now.day),
      u32(crc), u32(dataBytes.length), u32(dataBytes.length), u16(nameBytes.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), nameBytes
    ]);
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  });
  const localData = concatBytes(localParts);
  const centralData = concatBytes(centralParts);
  const end = concatBytes([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralData.length), u32(localData.length), u16(0)
  ]);
  return concatBytes([localData, centralData, end]);
}

function buildXlsxBlob(payload){
  const sheets = buildXlsxSheets(payload);
  const sheetContentTypes = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const workbookSheets = sheets.map((sheet, i) => `<sheet name="${xmlEsc(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  const workbookRels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("");
  const files = [
    { name: "[Content_Types].xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${sheetContentTypes}</Types>` },
    { name: "_rels/.rels", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: "docProps/core.xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Report GHG puntuale biomasse</dc:title><dc:creator>Sicu73 GHG puntuali</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>` },
    { name: "docProps/app.xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>GHG puntuali biomasse</Application></Properties>` },
    { name: "xl/workbook.xml", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", text: xlsxStylesXml() },
    ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: xlsxSheetXml(sheet) }))
  ];
  return new Blob([zipStore(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function exportPdf(){
  const payload = reportPayload();
  const reportWindow = window.open("", "_blank");
  if(!reportWindow){
    alert("Consenti l'apertura della finestra per generare il PDF.");
    return;
  }
  reportWindow.document.open();
  reportWindow.document.write(reportHtml(payload, "pdf"));
  reportWindow.document.close();
  reportWindow.focus();
  setTimeout(() => reportWindow.print(), 350);
}

function exportExcel(){
  const payload = reportPayload();
  const fileBase = cleanFileName(payload.profile.profile.profileId || payload.trace.progetto);
  const workbook = buildXlsxBlob(payload);
  download(`${fileBase}.xlsx`, workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function bind(){
  document.querySelectorAll("input,select").forEach((el) => el.addEventListener("input", render));
  document.querySelectorAll('input[type="file"]').forEach((el) => el.addEventListener("change", render));
  $("exportPdf").addEventListener("click", exportPdf);
  $("exportExcel").addEventListener("click", exportExcel);
  $("matrixSelect").addEventListener("change", () => {
    const m = selectedMatrix();
    if(m?.st) $("realSt").value = fmt(Number(m.st) * 100, 1).replace(",", ".");
    render();
  });
}

renderCatalog();
bind();
const defaultMatrix = DATA.matrices.find((m) => m.name.toLowerCase() === "mais") || DATA.matrices[0];
if(defaultMatrix) $("matrixSelect").value = defaultMatrix.id;
if(DATA.matrices[0]?.st) $("realSt").value = fmt(Number(DATA.matrices[0].st) * 100, 1).replace(",", ".");
if(defaultMatrix?.st) $("realSt").value = fmt(Number(defaultMatrix.st) * 100, 1).replace(",", ".");
render();
