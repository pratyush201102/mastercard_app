const DEFAULT_CSV = "davidson_county_ranked_shap_data.csv";
const API_ENDPOINT = "/api/tract-data";
const MAX_IMPROVEMENT_POINTS = 15;
const DEFAULT_IMPROVEMENT_POINTS = 10;

const state = {
  rows: [],
  selectedTract: null,
  sliderValues: {},
};

const tractSelect = document.getElementById("tractSelect");
const populationInput = document.getElementById("populationInput");
const yearsInput = document.getElementById("yearsInput");
const factorSliders = document.getElementById("factorSliders");
const fileInput = document.getElementById("fileInput");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");

const currentPctEl = document.getElementById("currentPct");
const scoreLiftEl = document.getElementById("scoreLift");
const projectedPctEl = document.getElementById("projectedPct");
const peopleLiftEl = document.getElementById("peopleLift");

function setStatus(message) {
  statusEl.textContent = message;
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parsePythonList(raw) {
  if (!raw || typeof raw !== "string") return [];

  const normalized = raw.trim();
  if (!normalized.startsWith("[") || !normalized.endsWith("]")) {
    return [];
  }

  try {
    return JSON.parse(normalized.replace(/'/g, '"'));
  } catch (_error) {
    // Fallback for slightly malformed rows.
    return normalized
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^'+|'+$/g, ""))
      .filter(Boolean);
  }
}

function safePct(value) {
  const num = toNumber(value);
  if (num === null) return null;
  return clamp(num, 0, 100);
}

function tractDisplayName(row) {
  const tract = row.Tract ?? "unknown";
  const score = toNumber(row["Health Insurance Coverage Score"]);
  const insured = safePct(row["Health Insurance Coverage Tract, %"]);
  return `Tract ${tract} | Score ${score ?? "-"} | Insured ${insured ?? "-"}%`;
}

function getRowByTract(tract) {
  return state.rows.find((row) => String(row.Tract) === String(tract));
}

function getTopNegativeFactors(row, count = 3) {
  const names = parsePythonList(row.Negative_SHAP_Features);
  const values = parsePythonList(row.Negative_SHAP_Values).map((v) => Number(v));

  const merged = names
    .map((name, idx) => ({
      name,
      shap: Number.isFinite(values[idx]) ? values[idx] : null,
    }))
    .filter((item) => item.name && Number.isFinite(item.shap) && item.shap < 0)
    .sort((a, b) => a.shap - b.shap)
    .slice(0, count)
    .map((factor) => {
      const tractPctCol = factor.name.replace(" Score", " Tract, %");
      const basePctCol = factor.name.replace(" Score", " Base, %");

      return {
        ...factor,
        tractPct: toNumber(row[tractPctCol]),
        basePct: toNumber(row[basePctCol]),
      };
    });

  return merged;
}

function estimateFactorRecovery(shapValue, improvementPoints) {
  const safePoints = clamp(Number(improvementPoints) || 0, 0, MAX_IMPROVEMENT_POINTS);
  const recoveryRatio = safePoints / MAX_IMPROVEMENT_POINTS;
  return Math.abs(shapValue) * recoveryRatio;
}

function renderTractOptions() {
  tractSelect.innerHTML = "";

  state.rows.forEach((row) => {
    const option = document.createElement("option");
    option.value = row.Tract;
    option.textContent = tractDisplayName(row);
    tractSelect.appendChild(option);
  });

  // Preselect the tract mentioned in your prompt, if present.
  const preferredTract = state.rows.find((r) => String(r.Tract) === "532290");
  const selected = preferredTract ?? state.rows[0];

  if (selected) {
    tractSelect.value = selected.Tract;
    state.selectedTract = selected.Tract;
  }
}

function renderFactorSliders() {
  factorSliders.innerHTML = "";

  const row = getRowByTract(state.selectedTract);
  if (!row) return;

  const factors = getTopNegativeFactors(row, 3);
  if (!factors.length) {
    setStatus("No negative SHAP factors were found for this tract.");
    return;
  }

  factors.forEach((factor) => {
    if (!(factor.name in state.sliderValues)) {
      state.sliderValues[factor.name] = DEFAULT_IMPROVEMENT_POINTS;
    }

    const card = document.createElement("div");
    card.className = "slider-card";

    const head = document.createElement("div");
    head.className = "slider-card-head";

    const factorName = document.createElement("div");
    factorName.className = "factor-name";
    factorName.textContent = factor.name;

    const shapChip = document.createElement("div");
    shapChip.className = "shap-chip";
    shapChip.textContent = `SHAP ${factor.shap.toFixed(2)}`;

    head.appendChild(factorName);
    head.appendChild(shapChip);

    const meta = document.createElement("p");
    meta.className = "factor-meta";
    const tractPct = Number.isFinite(factor.tractPct)
      ? `${factor.tractPct.toFixed(1)}%`
      : "n/a";
    const basePct = Number.isFinite(factor.basePct)
      ? `${factor.basePct.toFixed(1)}%`
      : "n/a";
    meta.textContent = `Current percentile: ${tractPct} | County baseline: ${basePct}`;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(MAX_IMPROVEMENT_POINTS);
    slider.step = "1";
    slider.value = String(state.sliderValues[factor.name]);

    const sliderLabel = document.createElement("p");
    sliderLabel.className = "factor-meta";
    sliderLabel.textContent = `Improvement target: ${slider.value} percentile points`;

    const recoveryPreview = document.createElement("p");
    recoveryPreview.className = "factor-meta";

    const updateRecoveryPreview = () => {
      const sliderPts = Number(slider.value);
      const projectedPct = Number.isFinite(factor.tractPct)
        ? clamp(factor.tractPct + sliderPts, 0, 100)
        : null;
      const recovered = estimateFactorRecovery(factor.shap, sliderPts);
      const projectedText = projectedPct === null ? "n/a" : `${projectedPct.toFixed(1)}%`;
      recoveryPreview.textContent = `Modeled recovery: +${recovered.toFixed(2)} score points | Projected percentile: ${projectedText}`;
    };
    updateRecoveryPreview();

    slider.addEventListener("input", () => {
      state.sliderValues[factor.name] = Number(slider.value);
      sliderLabel.textContent = `Improvement target: ${slider.value} percentile points`;
      updateRecoveryPreview();
      calculateAndRenderImpact();
    });

    card.appendChild(head);
    card.appendChild(meta);
    card.appendChild(slider);
    card.appendChild(sliderLabel);
    card.appendChild(recoveryPreview);

    factorSliders.appendChild(card);
  });

  setStatus(`Loaded top ${factors.length} negative SHAP factors for Tract ${row.Tract}.`);
}

function calculateAndRenderImpact() {
  const row = getRowByTract(state.selectedTract);
  if (!row) return;

  const factors = getTopNegativeFactors(row, 3);
  const population = clamp(Number(populationInput.value) || 0, 0, 10_000_000);

  const currentInsuredPct = safePct(row["Health Insurance Coverage Tract, %"]);
  const currentInsuredSafe = currentInsuredPct ?? 0;

  let scoreLift = 0;
  factors.forEach((factor) => {
    const sliderPts = clamp(Number(state.sliderValues[factor.name] ?? 0), 0, MAX_IMPROVEMENT_POINTS);
    const recovered = estimateFactorRecovery(factor.shap, sliderPts);
    scoreLift += recovered;
  });

  const projectedPct = clamp(currentInsuredSafe + scoreLift, 0, 100);
  const pctPointGain = projectedPct - currentInsuredSafe;

  const currentInsuredPeople = Math.round((currentInsuredSafe / 100) * population);
  const projectedInsuredPeople = Math.round((projectedPct / 100) * population);
  const additionalPeople = Math.max(0, projectedInsuredPeople - currentInsuredPeople);

  currentPctEl.textContent = `${currentInsuredSafe.toFixed(1)}% (${currentInsuredPeople.toLocaleString()} people)`;
  scoreLiftEl.textContent = `+${scoreLift.toFixed(2)} points`;
  projectedPctEl.textContent = `${projectedPct.toFixed(1)}% (+${pctPointGain.toFixed(1)} pts)`;
  peopleLiftEl.textContent = `${additionalPeople.toLocaleString()} people`;

  const years = Number(yearsInput.value) || 3;
  setStatus(
    `Estimated achievable in ${years} year${years === 1 ? "" : "s"}: about ${additionalPeople.toLocaleString()} additional insured residents.`
  );
}

function loadRows(rows) {
  const validRows = rows.filter((row) => row.Tract && row["Health Insurance Coverage Tract, %"] !== undefined);

  if (!validRows.length) {
    throw new Error("CSV did not contain expected rows.");
  }

  state.rows = validRows;
  state.sliderValues = {};

  renderTractOptions();
  renderFactorSliders();
  calculateAndRenderImpact();
}

function parseCsvText(csvText) {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const parsedRows = Array.isArray(result.data)
    ? result.data.filter((row) => row && Object.keys(row).length > 0)
    : [];

  if (!parsedRows.length) {
    throw new Error("CSV parse error: no usable rows were found.");
  }

  if (result.errors?.length) {
    const parseWarnings = result.errors
      .filter((error) => error && error.message)
      .slice(0, 1)
      .map((error) => error.message)
      .join(" ");

    setStatus(
      `Loaded with parser warnings. ${parseWarnings || "Some malformed rows were skipped."}`
    );
  }

  return parsedRows;
}

async function loadDefaultCsv() {
  setStatus("Loading default CSV...");
  const res = await fetch(DEFAULT_CSV);
  if (!res.ok) {
    throw new Error(`Could not load ${DEFAULT_CSV}. Use the file picker.`);
  }
  const csvText = await res.text();
  const rows = parseCsvText(csvText);
  loadRows(rows);
}

async function loadRowsFromApi() {
  setStatus("Loading tract data from backend...");
  const res = await fetch(API_ENDPOINT);
  if (!res.ok) {
    throw new Error(`Backend returned ${res.status}`);
  }

  const payload = await res.json();
  if (!payload || !Array.isArray(payload.rows)) {
    throw new Error("Backend response is missing rows.");
  }

  loadRows(payload.rows);
}

tractSelect.addEventListener("change", (event) => {
  state.selectedTract = event.target.value;
  state.sliderValues = {};
  renderFactorSliders();
  calculateAndRenderImpact();
});

populationInput.addEventListener("input", calculateAndRenderImpact);
yearsInput.addEventListener("input", calculateAndRenderImpact);

resetBtn.addEventListener("click", () => {
  const row = getRowByTract(state.selectedTract);
  if (!row) return;
  getTopNegativeFactors(row, 3).forEach((factor) => {
    state.sliderValues[factor.name] = DEFAULT_IMPROVEMENT_POINTS;
  });
  renderFactorSliders();
  calculateAndRenderImpact();
});

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    setStatus(`Loading ${file.name}...`);
    const text = await file.text();
    const rows = parseCsvText(text);
    loadRows(rows);
  } catch (error) {
    setStatus(`Could not load file: ${error.message}`);
  }
});

(async function init() {
  try {
    await loadRowsFromApi();
  } catch (error) {
    try {
      await loadDefaultCsv();
    } catch (fallbackError) {
      setStatus(
        `${error.message}. Fallback also failed: ${fallbackError.message}. Select a CSV using \"Load another CSV\".`
      );
    }
  }
})();
