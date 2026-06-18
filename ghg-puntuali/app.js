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
      credito: "-(tonnellate * kgCO2e_t_evitati) * 1000 / energia_MJ_lotto"
    },
    risultati: {
      pesoNormalizzatoT: result.normTon,
      energiaMj: result.energyMj,
      metanoM3: result.methaneM3,
      ec: result.ec,
      etd: result.etd,
      credito: result.credit,
      totalePuntuale: result.punctualTotal,
      totaleStandard: result.standardTotal,
      differenzaVsStandard: Number.isFinite(result.standardTotal) ? result.punctualTotal - result.standardTotal : null
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
        ${row("Totale standard", Number.isFinite(trace.risultati.totaleStandard) ? `${fmt(trace.risultati.totaleStandard, 2)} gCO2e/MJ` : "n/d")}
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
        ${row("Totale puntuale", `${fmt(trace.risultati.totalePuntuale, 3)} gCO2e/MJ`)}
        ${row("Delta vs standard", trace.risultati.differenzaVsStandard === null ? "n/d" : `${fmt(trace.risultati.differenzaVsStandard, 3)} gCO2e/MJ`)}
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
      <summary>JSON tecnico esportabile</summary>
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

  const credit = matrix.category === "effluente"
    ? -(quantityT * num("avoidedKgT")) * 1000 / Math.max(energyMj, 0.0001)
    : 0;

  const punctualTotal = ec + etd + credit;
  const evidence = evidenceComplete(matrix);
  const status = evidence.complete ? "Validabile" : "Evidenze incomplete";

  return { matrix, quantityT, realSt, refSt, normTon, energyMj, methaneM3, standard, standardTotal, ec, etd, credit, punctualTotal, evidence, status };
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

  $("ecOut").textContent = `${fmt(result.ec, 2)} gCO2e/MJ`;
  $("etdOut").textContent = `${fmt(result.etd, 2)} gCO2e/MJ`;
  $("creditOut").textContent = `${fmt(result.credit, 2)} gCO2e/MJ`;

  $("evidenceStatus").textContent = evidence.complete ? "Evidenze complete" : "Evidenze incomplete";
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
      standardTotal: r.standardTotal,
      punctual: { ec: r.ec, etd: r.etd, credit: r.credit, total: r.punctualTotal },
      evidence: r.evidence,
      status: r.evidence.complete ? "validated-ready" : "blocked-missing-evidence"
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

function downloadProfile(){
  const payload = profilePayload();
  download(`${payload.profile.profileId || "profilo-ghg"}.json`, JSON.stringify(payload, null, 2), "application/json");
}

function downloadCatalogCsv(){
  const rows = [["id","name","category","st","methane_m3_ttq","mj_kg_tq","source"]];
  DATA.matrices.forEach((m) => rows.push([m.id, m.name, m.category, m.st, m.methane_m3_ttq, m.mj_kg_tq, m.source]));
  const csv = rows.map((row) => row.map((v) => `"${String(v ?? "").replaceAll('"','""')}"`).join(",")).join("\n");
  download("catalogo-uni11567-matrici.csv", csv, "text/csv");
}

function bind(){
  document.querySelectorAll("input,select").forEach((el) => el.addEventListener("input", render));
  document.querySelectorAll('input[type="file"]').forEach((el) => el.addEventListener("change", render));
  $("downloadProfile").addEventListener("click", downloadProfile);
  $("downloadCsv").addEventListener("click", downloadCatalogCsv);
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
