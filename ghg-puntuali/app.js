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

function standardCandidates(matrix){
  const name = matrix.name.toLowerCase();
  const group =
    matrix.category === "effluente" ? "effluente" :
    matrix.category === "forsu" ? "forsu" :
    matrix.category === "sottoprodotti" ? "resid" :
    name.includes("mais") ? "mais" :
    name.includes("sorgo") ? "sorgo" :
    name.includes("triticale") ? "triticale" :
    name.includes("frumento") ? "frumento" :
    name.includes("orzo") ? "orzo" :
    name.includes("loietto") ? "loietto" :
    "configurazione";
  return STANDARD_ROWS.filter((row) => {
    const filiera = String(row.filiera || "").toLowerCase();
    const digest = String(row.digestato || "");
    const offgas = String(row.offgas || "");
    const filieraMatches = group === "effluente"
      ? (filiera.includes("effluente") || filiera.includes("letame") || filiera.includes("liquame"))
      : filiera.includes(group);
    return filieraMatches
      && digest.includes($("digestate").value)
      && offgas === $("offgas").value;
  });
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
      ec: "(N*fattoreN + gasolio*2.68 + elettricita*0.32) * 1000 / energia_MJ_ha",
      etd: "tonnellate * km * fattore_mezzo * 1000 / energia_MJ_lotto",
      credito: "scenario != none ? -(tonnellate * kgCO2e_t_evitati) * 1000 / energia_MJ_lotto : 0",
      confrontoFornitura: "delta = (ec+etd+credito)_puntuale - (ec+etd+crediti)_standard [gCO2e/MJ biometano]; ep di processo escluso (compete all'impianto)"
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
  const energyMjHa = Math.max(yieldTha * Math.max(mjKgTq, 0.001) * 1000, 0.0001);
  const ec = matrix.category === "coltura"
    ? (nitrogenKgHa * factorN + dieselLHa * factorDefaults.dieselKgCO2eL + electricityKwhHa * factorDefaults.electricityKgCO2eKwh) * 1000 / energyMjHa
    : 0;

  const etd = energyMj > 0
    ? (quantityT * num("distanceKm") * num("transportFactor")) * 1000 / energyMj
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

  return { matrix, quantityT, realSt, refSt, normTon, energyMj, methaneM3, standard, standardTotal, stdEc, stdEtd, stdCred, stdEp, avoidedScenario, ec, etd, credit, punctualTotal, standardSupplyTotal, supplyDelta, evidence, status };
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
  const blob = new Blob([text], { type });
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
  const html = reportHtml(payload, "excel");
  download(`${fileBase}.xls`, `\ufeff${html}`, "application/vnd.ms-excel;charset=utf-8");
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
