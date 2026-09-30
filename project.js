// Flow2kW projects: several pump / fan selections per project, saved as JSON, autosaved in this browser,
// and printed as a PDF schedule (pumps, electrical, controls, energy) with the adi Climate Systems branding.
// Loaded after the main script and uses its globals (S, calc, update, MODES, …).

const PROJECT_FORMAT = 1;
const AUTOSAVE_KEY = "flow2kw-project";
const SNAP_EXCLUDE = new Set(["kb-confirm", "defence"]);
const SEL_FIELDS = ["sel-ref", "sel-service", "sel-bms", "sel-notes", "sel-inverter", "control-notes"];
const PJ_FIELDS = ["pj-name", "pj-number", "pj-client", "pj-engineer", "pj-rev", "pj-date"];

const P = {
  selections: [],   // { uid, ref, service, bms, notes, snapshot, summary, note }
  currentUid: null, // selection being edited, or null for a new one
  restoring: false,
  saveTimer: 0,
  draftBaseline: null
};

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 3200);
}

// ---------- snapshots of the calculator inputs ----------
function snapFields() {
  return [...document.querySelectorAll("main input[id], main select[id]")]
    .filter((el) => !SNAP_EXCLUDE.has(el.id) && !el.hasAttribute("data-nosnap") && el.type !== "file");
}
function getSnapshot() {
  const fields = {};
  snapFields().forEach((el) => { fields[el.id] = el.type === "checkbox" ? el.checked : el.value; });
  return {
    state: { fluid: S.fluid, system: S.system, glycol: S.glycol, job: S.job, affPlant: S.affPlant, modes: { ...S.modes }, set: { ...S.set } },
    fields
  };
}
// Rebuild the calculator from a snapshot. Unit lists and machine lists depend on fluid / system, so those go first.
function applySnapshot(snap, { confirmed = false } = {}) {
  if (!snap || !snap.state || !snap.fields) return;
  const st = snap.state;
  S.suppress = true;
  try {
    setFluid(["water", "glycol", "air"].includes(st.fluid) ? st.fluid : "water");
    if (st.system && st.system !== S.system) setSystem(st.system === "fan" ? "fan" : "pump");
    setJob(st.job === "upgrade" ? "upgrade" : "new");
    S.glycol = st.glycol === "PG" ? "PG" : "EG";
    document.querySelectorAll("[data-glycol]").forEach((b) => b.classList.toggle("active", b.dataset.glycol === S.glycol));
    if (st.modes) S.modes = { existing: String(st.modes.existing || "dp-pump"), proposed: String(st.modes.proposed || "dp-pump") };
    if (st.set) S.set = { ...MODE_SET_DEFAULTS, ...Object.fromEntries(Object.entries(st.set).map(([k, v]) => [k, Number(v)])) };
    S.affPlant = st.job === "upgrade" && st.affPlant === "existing" ? "existing" : "proposed";
    snapFields().forEach((el) => {
      if (!(el.id in snap.fields)) return;
      const v = snap.fields[el.id];
      if (el.type === "checkbox") el.checked = !!v;
      else el.value = String(v);
    });
    $("temp-num").value = $("temp").value;
    $("meas-box").classList.toggle("hidden", !$("use-meas").checked);
    $("vapf-box").classList.toggle("hidden", !$("use-vapf").checked);
    markEraFromCurrent();
  } finally {
    S.suppress = false;
  }
  $("kb-confirm").checked = confirmed;
  S.keySig = null;
  S.keyFlash = {};
  update();
}

// ---------- schedule summaries ----------
const SENSOR = {
  "dp-pump": "DP transmitter across the unit (or its built-in sensor)",
  propp: "Built-in / sensorless (proportional pressure)",
  "dp-index": "Remote DP sensor at the index circuit",
  "flow-primary": "Summed active secondary flow measurement + common primary flow meter feedback to BMS",
  static: "Pressure transmitter to suit static lift",
  friction: "None — speed set by BMS / demand",
  fixed: "None — fixed speed"
};
function stripTags(html) { return String(html).replace(/<[^>]*>/g, ""); }
function pressText(m) { return m.kind === "fan" ? `${fmt(m.head * 1000, 0)} Pa` : `${fmt(m.head, 0)} kPa`; }
function fluidText(c) {
  if (c.fluid === "air") return `Air ${c.T} °C`;
  if (c.fluid === "glycol") return `${$("glycol-pct").value}% ${S.glycol} ${c.T} °C`;
  return `Water ${c.T} °C`;
}
function summarize(c, sel) {
  const p = c.prop;
  const el = c.prEl;
  const mode = byId(MODES, c.prMode);
  const req = byId(MODES, c.propDesign.modeReq);
  const setVal = mode.set ? c.set[mode.set.key] : null;
  const setpoint = mode.id === "flow-primary"
    ? `Primary flow = ${Math.round(c.set.tracking * 100)}% × measured total secondary flow (secondary design ${fmt(c.Q * 1000 / c.set.tracking, 2)} L/s → primary design ${fmt(c.Q * 1000, 2)} L/s)`
    : mode.set
    ? `${Math.round(setVal * 100)}% of design (${fmt(c.dP * setVal, 0)} kPa)`
    : mode.id === "dp-pump" ? `${fmt(c.dP, 0)} kPa` : "—";
  const vsd = hasVsd(p.drive);
  const driveType = p.drive.id === "included" ? "Integrated EC" : vsd ? "VSD" : isMechanicalDrive(p.drive) ? "Belt, DOL" : "DOL";
  const rated = c.propKw;
  const changeover = c.nStby > 0
    ? `Duty / standby: auto changeover on fault, run-hour rotation${c.nRun > 1 ? "; duty / assist cascade" : ""}`
    : c.nRun > 1 ? "Duty / assist cascade on demand" : "Single unit";
  return {
    ref: sel.ref, service: sel.service, bms: sel.bms, notes: sel.notes, controlNotes: sel.controlNotes || "", inverter: sel.inverter || "auto",
    kind: c.system, job: S.job,
    fluid: fluidText(c),
    flowTotal: c.Q * 1000, flowEach: c.QEach * 1000, head: c.dP, headM: c.fluid === "air" ? null : c.dP * 1000 / (c.props.rho * G),
    nRun: c.nRun, nStby: c.nStby,
    machine: `${p.machine.year} ${p.machine.label}`, unitEff: p.hyd, bundled: p.machine.bundled === "motor+drive",
    shaftEach: c.propHydShaft,
    motorKw: sizeLabel(c.propSuggest, rated), motorRatedKw: rated, motorClass: p.motor.year, motorEff: p.mot,
    drive: p.drive.label, driveType,
    elecEach: c.propElecEach, elecTotal: c.propElec, w2w: c.propW2w,
    supply: supplyLabel(c.supply), pf: el.pf, ampsEach: el.amps, flcEach: el.flcAmps,
    connectedKw: (Number(rated) || 0) * (c.nRun + c.nStby), maxDemandKw: el.fullLoadKw * c.nRun,
    control: mode.label + (req.id !== mode.id ? ` (asked for ${req.short}; no VSD)` : ""), controlShort: mode.short,
    setpoint, sensor: SENSOR[mode.id] || "", changeover,
    flowTracking: req.id === "flow-primary" ? { ratio: c.set.tracking, secondaryDesign: c.Q * 1000 / c.set.tracking, primaryDesign: c.Q * 1000 } : null,
    kwh: c.propKwh, gbp: c.propKwh * c.tariff, co2: c.propKwh * c.carbon, profile: c.profile.label, hours: c.hours,
    upgrade: hasExisting() ? { existingKw: c.elec, existingKwh: c.kwh, saveKwh: c.saveKwh, saveGbp: c.saveGbp, payback: c.payback } : null,
    warnings: keyChecks(c).filter((w) => w.level === "red").map((w) => stripTags(w.text))
  };
}
function cleanNote(txt) { return String(txt).replace(/^⚠ KEY SETTINGS NOT YET CONFIRMED[^\n]*\n\n/, ""); }
function selFromInputs() {
  return {
    ref: $("sel-ref").value.trim() || nextRef(),
    service: $("sel-service").value.trim(),
    bms: $("sel-bms").value,
    notes: $("sel-notes").value.trim(),
    inverter: $("sel-inverter").value,
    controlNotes: $("control-notes").value.trim()
  };
}
function nextRef() {
  const prefix = S.system === "fan" ? "F-" : "P-";
  const nums = P.selections.map((s) => s.ref).filter((r) => r.startsWith(prefix)).map((r) => parseInt(r.slice(prefix.length), 10)).filter(Number.isFinite);
  return prefix + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, "0");
}
function setSelInputs(sel) {
  $("sel-ref").value = sel.ref || nextRef();
  $("sel-service").value = sel.service || "";
  if (sel.bms) $("sel-bms").value = sel.bms;
  $("sel-notes").value = sel.notes || "";
  $("control-notes").value = sel.controlNotes || "";
  $("sel-inverter").value = ["auto", "onboard", "packaged", "external"].includes(sel.inverter) ? sel.inverter : "auto";
}

// Add the current calculator state to the schedule (or update the selection being edited).
function saveSelection(andNext = false) {
  if (!$("kb-confirm").checked) {
    toast("Check the key settings first — tick “I've checked these settings” at the top.");
    $("keybar").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const c = calc();
  const sel = selFromInputs();
  const clash = P.selections.find((s) => s.ref === sel.ref && s.uid !== P.currentUid);
  if (clash) {
    toast(`Ref ${sel.ref} is already in the schedule — change the ref first.`);
    $("sel-ref").focus();
    return;
  }
  const record = { ...sel, snapshot: getSnapshot(), summary: summarize(c, sel), note: cleanNote(defenceText(c)) };
  const existing = P.currentUid ? P.selections.find((s) => s.uid === P.currentUid) : null;
  if (existing) {
    Object.assign(existing, record);
    toast(`${sel.ref} updated in the schedule.`);
  } else {
    record.uid = uid();
    P.selections.push(record);
    P.currentUid = record.uid;
    toast(`${sel.ref} added to the schedule.`);
  }
  if (andNext) {
    startNextSelection();
    toast(`${sel.ref} saved. ${$("sel-ref").value} is ready — change the duty for the next selection.`);
  }
  refreshProjectUi();
  scheduleAutosave();
}
function editSelection(id) {
  const sel = P.selections.find((s) => s.uid === id);
  if (!sel) return;
  P.currentUid = sel.uid;
  setSelInputs(sel);
  applySnapshot(sel.snapshot, { confirmed: true });
  refreshProjectUi();
  toast(`Editing ${sel.ref}.`);
  $("schedule-card").scrollIntoView({ behavior: "smooth", block: "start" });
}
function copySelection(id) {
  const sel = P.selections.find((s) => s.uid === id);
  if (!sel) return;
  P.currentUid = null;
  applySnapshot(sel.snapshot, { confirmed: false });
  setSelInputs({ ...sel, ref: nextRef(), service: sel.service ? `${sel.service} (copy)` : "" });
  refreshProjectUi();
  toast(`Copied ${sel.ref} — adjust it, confirm the key settings, then add it to the schedule.`);
}
function deleteSelection(id) {
  const sel = P.selections.find((s) => s.uid === id);
  if (!sel || !confirm(`Delete ${sel.ref}${sel.service ? ` — ${sel.service}` : ""} from the schedule?`)) return;
  P.selections = P.selections.filter((s) => s.uid !== id);
  if (P.currentUid === id) P.currentUid = null;
  refreshProjectUi();
  scheduleAutosave();
}
function startNextSelection() {
  P.currentUid = null;
  setSelInputs({ ref: nextRef(), bms: $("sel-bms").value, inverter: $("sel-inverter").value });
  resetNewPlantDefaults();
  $("kb-confirm").checked = false;
  rememberDraft();
  update();
  refreshProjectUi();
  $("schedule-card").scrollIntoView({ behavior: "smooth", block: "start" });
  $("sel-service").focus({ preventScroll: true });
}

function resetNewPlantDefaults() {
  applyEra("y2026", true);
  $("prop-motor-frame").value = "auto";
}

function draftSignature() { return JSON.stringify({ snapshot: getSnapshot(), sel: selFromInputs() }); }
function rememberDraft() { P.draftBaseline = draftSignature(); }
function hasUnsavedSelection() { return P.currentUid ? isDirty() : P.draftBaseline !== draftSignature(); }

function isDirty() {
  const cur = P.selections.find((s) => s.uid === P.currentUid);
  if (!cur) return true;
  const sel = selFromInputs();
  return JSON.stringify(getSnapshot()) !== JSON.stringify(cur.snapshot) || ["ref", "service", "bms", "notes", "inverter", "controlNotes"].some((k) => sel[k] !== (cur[k] ?? (k === "inverter" ? "auto" : "")));
}

function refreshProjectUi() {
  const cur = P.selections.find((s) => s.uid === P.currentUid);
  const hasFans = P.selections.some((s) => s.summary.kind === "fan");
  const hasPumps = P.selections.some((s) => s.summary.kind === "pump");
  $("sched-title").textContent = hasFans && hasPumps ? "Pump & fan schedule" : hasFans ? "Fan schedule" : "Pump schedule";
  const dirty = cur && isDirty();
  $("sel-status").textContent = cur ? `Editing ${cur.ref}${dirty ? " — unsaved changes" : " — saved"}` : "New selection — not yet in the schedule";
  $("sel-status").className = "pill" + (cur && !dirty ? " green" : " amber");
  $("sel-save").textContent = cur ? `Update ${cur.ref}` : "Add to schedule";
  $("finish-save").textContent = $("sel-save").textContent;
  ["sel-next", "finish-next"].forEach((id) => { $(id).textContent = cur ? "Update & next selection" : "Add & next selection"; });
  $("finish-status").textContent = `${cur ? "Editing" : "Next selection"}: ${$("sel-ref").value || nextRef()} · ${P.selections.length} saved`;
  const ok = $("kb-confirm").checked;
  ["sel-save", "sel-next", "finish-save", "finish-next"].forEach((id) => {
    $(id).classList.toggle("warn", !ok);
    $(id).title = ok ? "" : "Tick “I've checked these settings” at the top first";
  });
  $("sched-body").innerHTML = P.selections.length
    ? P.selections.map((s) => {
      const m = s.summary;
      return `<tr class="${s.uid === P.currentUid ? "cur" : ""}">
        <td><b>${esc(s.ref)}</b></td><td>${esc(s.service) || "—"}</td>
        <td>${fmt(m.flowTotal, 2)} L/s @ ${pressText(m)}</td>
        <td>${esc(arrangementText(m))}</td>
        <td>${fmt(m.flowEach, 2)} L/s @ ${pressText(m)}</td>
        <td>${esc(m.motorKw)} kW ${esc(m.motorClass)} · ${esc(m.driveType)}</td>
        <td>${fmt(m.elecTotal, 2)}</td>
        <td>${fmt(m.ampsEach, 1)} / ${fmt(m.flcEach, 1)} A</td>
        <td>${esc(m.controlShort)}</td>
        <td class="acts"><button class="btn lite" type="button" data-act="edit" data-id="${s.uid}">Edit</button><button class="btn lite" type="button" data-act="copy" data-id="${s.uid}">Copy</button><button class="btn lite" type="button" data-act="del" data-id="${s.uid}">Delete</button></td>
      </tr>`;
    }).join("")
    : `<tr><td class="empty" colspan="10">No selections yet. Set up a duty below, confirm the key settings, then “Add & next selection”. Each saved selection gets its own line in the exports.</td></tr>`;
  const name = $("pj-name").value.trim();
  $("pj-status").textContent = `${name ? name + " · " : ""}${P.selections.length} selection${P.selections.length === 1 ? "" : "s"} · autosaved in this browser — use “Save project” to keep a file you can reopen or share.`;
  if (!$("supplier-email-panel").hidden) refreshSupplierEmail();
}

// ---------- project file / autosave ----------
function projectData() {
  return {
    app: "Flow2kW",
    format: PROJECT_FORMAT,
    savedAt: new Date().toISOString(),
    project: Object.fromEntries(PJ_FIELDS.map((id) => [id.slice(3), $(id).value])),
    selections: P.selections.map(({ uid: id, ref, service, bms, notes, inverter, controlNotes, snapshot }) => ({ uid: id, ref, service, bms, notes, inverter, controlNotes, snapshot })),
    current: { uid: P.currentUid, sel: selFromInputs(), snapshot: getSnapshot(), draftBaseline: P.draftBaseline }
  };
}
function autosaveNow() {
  clearTimeout(P.saveTimer);
  try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(projectData())); } catch (e) { /* storage unavailable — file save still works */ }
}
function scheduleAutosave() {
  if (P.restoring) return;
  clearTimeout(P.saveTimer);
  P.saveTimer = setTimeout(autosaveNow, 600);
}
// Save straight away when the app is closed or sent to the background.
window.addEventListener("pagehide", () => { if (!P.restoring) autosaveNow(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && !P.restoring) autosaveNow(); });
const str = (v, n = 200) => String(v ?? "").slice(0, n);
// Load a project: recompute every selection with the current tool so the schedule matches this version's maths.
function loadProject(data, { quiet = false } = {}) {
  if (!data || data.app !== "Flow2kW" || !Array.isArray(data.selections)) throw new Error("Not a Flow2kW project file");
  P.restoring = true;
  try {
    const pj = data.project || {};
    PJ_FIELDS.forEach((id) => { $(id).value = str(pj[id.slice(3)]); });
    P.selections = [];
    data.selections.forEach((raw) => {
      const sel = { uid: str(raw.uid, 40) || uid(), ref: str(raw.ref, 20), service: str(raw.service), bms: str(raw.bms, 80), notes: str(raw.notes, 300), controlNotes: str(raw.controlNotes, 2000), inverter: ["onboard", "packaged", "external"].includes(raw.inverter) ? raw.inverter : "auto", snapshot: raw.snapshot };
      applySnapshot(sel.snapshot, { confirmed: true });
      const c = calc();
      sel.summary = summarize(c, sel);
      sel.note = cleanNote(defenceText(c));
      P.selections.push(sel);
    });
    const cur = data.current || {};
    if (typeof cur.draftBaseline === "string") P.draftBaseline = cur.draftBaseline;
    P.currentUid = P.selections.some((s) => s.uid === cur.uid) ? cur.uid : null;
    if (cur.snapshot) applySnapshot(cur.snapshot, { confirmed: !!P.currentUid && JSON.stringify(cur.snapshot) === JSON.stringify(P.selections.find((s) => s.uid === P.currentUid).snapshot) });
    setSelInputs(cur.sel ? { ref: str(cur.sel.ref, 20), service: str(cur.sel.service), bms: str(cur.sel.bms, 80), notes: str(cur.sel.notes, 300), controlNotes: str(cur.sel.controlNotes, 2000), inverter: cur.sel.inverter } : { ref: nextRef() });
  } finally {
    P.restoring = false;
  }
  refreshProjectUi();
  scheduleAutosave();
  if (!quiet) toast(`Opened ${$("pj-name").value || "project"} — ${P.selections.length} selection${P.selections.length === 1 ? "" : "s"}.`);
}
function newProject() {
  if (P.selections.length && !confirm("Start a new project? The current schedule will be cleared — save it first if you need it.")) return;
  P.selections = [];
  P.currentUid = null;
  PJ_FIELDS.forEach((id) => { $(id).value = ""; });
  $("pj-rev").value = "A";
  $("pj-date").value = new Date().toISOString().slice(0, 10);
  setSelInputs({ ref: "P-01" });
  $("sel-service").value = "";
  $("sel-notes").value = "";
  resetNewPlantDefaults();
  $("kb-confirm").checked = false;
  rememberDraft();
  update();
  refreshProjectUi();
  scheduleAutosave();
  toast("New project started.");
}

function fileBase(suffix) {
  const parts = [$("pj-number").value.trim(), $("pj-name").value.trim() || "Project", suffix, $("pj-rev").value.trim() ? `Rev ${$("pj-rev").value.trim()}` : ""].filter(Boolean);
  return parts.join(" - ").replace(/[\\/:*?"<>|]+/g, "").slice(0, 120);
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function saveProjectFile() {
  download(new Blob([JSON.stringify(projectData(), null, 2)], { type: "application/json" }), fileBase("Flow2kW") + ".json");
  toast("Project saved. Open it again with “Open…”.");
}

// Supplier enquiries use saved pump duties, never the affinity explorer's simulated points.
function pumpSelections() { return P.selections.filter((s) => s.summary.kind === "pump"); }
function inverterRequest(m) {
  if (m.driveType === "DOL" || m.driveType === "Belt, DOL") return `Fixed speed: ${m.driveType}; no inverter requested.`;
  if (m.driveType === "Integrated EC") return "Onboard motor electronics included in the pump rating; confirm the proposed package.";
  if (m.inverter === "external") return "External inverter per pump: please specify Danfoss, Siemens or Grundfos, matched to the selected motor and controls.";
  if (m.inverter === "onboard") return "Onboard inverter per pump preferred; please confirm availability and suitability.";
  if (m.inverter === "packaged") return "Factory packaged inverter per pump requested (e.g. Grundfos CUE package where applicable); confirm the mounting arrangement, model and controls.";
  return "Integral or factory packaged inverter preferred where available. Confirm the drive arrangement for the selected model; if a separate external drive is required, quote Danfoss, Siemens or Grundfos matched to the motor and controls.";
}
function supplierEnquiry() {
  const pj = Object.fromEntries(PJ_FIELDS.map((id) => [id.slice(3), $(id).value.trim()]));
  const supplier = $("email-supplier").value.trim();
  const subject = `Pump quotation enquiry${pj.number ? " - " + pj.number : ""}${pj.name ? " - " + pj.name : ""}${pj.rev ? " - Rev " + pj.rev : ""}`.replace(/[\r\n]/g, " ");
  const duties = pumpSelections().map((s) => {
    const m = s.summary;
    const warnings = m.warnings.length ? `\nDesign queries to resolve: ${m.warnings.join("; ")}` : "";
    return `${s.ref}${s.service ? " - " + s.service : ""}
Total set duty: ${fmt(m.flowTotal, 2)} L/s (${fmt(m.flowTotal * 3.6, 2)} m³/h) at ${fmt(m.head, 1)} kPa / ${fmt(m.headM, 2)} m head.
Arrangement: ${arrangementText(m)}.
Quantity: ${m.nRun + m.nStby} pumps (${m.nRun} running${m.nStby ? " + " + m.nStby + " standby" : "; no standby"}).
Design duty PER PUMP: ${fmt(m.flowEach, 2)} L/s (${fmt(m.flowEach * 3.6, 2)} m³/h) at ${fmt(m.head, 1)} kPa / ${fmt(m.headM, 2)} m head.
Total flow is shared equally between the running pumps in parallel; each pump develops the full stated head. Standby pumps add no flow to the duty.
Fluid: ${m.fluid}.
Indicative motor rating: ${m.motorKw} kW per pump, ${m.motorClass}. Estimated pump shaft power: ${fmt(m.shaftEach, 2)} kW per pump; electrical input at duty: ${fmt(m.elecEach, 2)} kW per pump (${fmt(m.elecTotal, 2)} kW for the running set). Please confirm final P2 motor rating and P1 input from your selection.
Supply: ${m.supply}, 50 Hz.
Control: ${m.control}.${m.setpoint !== "—" ? " Set point: " + m.setpoint + "." : ""}
Sensor: ${m.sensor}.
Operation: ${m.changeover}.
${m.flowTracking ? `Flow tracking sequence: BMS sums the active secondary flows and sets total primary flow to ${Math.round(m.flowTracking.ratio * 100)}% of that total. Regulate the running primary pumps using common primary flow feedback. Include duty / assist staging, plant minimum-flow and maximum-duty limits, sensor-failure alarm and agreed fallback. Please confirm the required flow meters, controller and signal interfaces.\n` : ""}
BMS: ${s.bms || "Please confirm interface"}.
${s.controlNotes ? "Control notes: " + s.controlNotes + "\n" : ""}
Inverter: ${inverterRequest(m)}${s.notes ? "\nAdditional requirements: " + s.notes : ""}${warnings}`;
  }).join("\n\n");
  const body = `Hello${supplier ? " " + supplier + " team" : ""},

Please select and quote for the following pumps${pj.name ? " for " + pj.name : ""}.${pj.number ? " Project reference: " + pj.number + "." : ""}${pj.client ? " Client: " + pj.client + "." : ""}

${duties}

Please confirm whether each selected pump has an integral motor drive, a factory packaged inverter or requires a separate external inverter. There is no universal motor kW cut-off. Where separate external drives are required, please quote Danfoss, Siemens or Grundfos inverters for each pump. Please confirm the actual motor efficiency class; a manufacturer-standard IE5 package is acceptable against an indicative IE4 requirement.

Please return:
- Pump make, model, impeller size and selection datasheet for each reference.
- Manufacturer Q/H curves with the duty point marked, plus efficiency, shaft power and NPSHr curves; include the relevant variable speed operating range and minimum permitted flow.
- Confirmed IE motor class, P2 motor rating, P1 electrical input at duty, full load current and inverter details. Motor powers above are design estimates, not final manufacturer selections.
- Confirmation of the requested control, sensors, BMS interface and duty / assist / standby operation, with any required control panel or accessories itemised.
- Itemised price, delivery lead time, quotation validity, exclusions and any information you need to finalise the selection.

Kind regards,
${pj.engineer || "Engineering team"}
adi Climate Systems`;
  return { subject, body };
}
function refreshSupplierEmail() {
  const email = supplierEnquiry();
  $("email-subject").value = email.subject;
  $("email-body").value = email.body;
  const omitted = P.selections.length - pumpSelections().length;
  $("email-draft-note").textContent = [
    hasUnsavedSelection() ? "Your current selection has unsaved changes. Add or update it to include those changes in this email." : "",
    omitted ? `${omitted} fan selection${omitted === 1 ? " is" : "s are"} omitted from this pump enquiry.` : ""
  ].filter(Boolean).join(" ");
  ["email-copy", "email-download"].forEach((id) => { $(id).disabled = !pumpSelections().length; });
}
function openSupplierEmail() {
  if (!pumpSelections().length) { toast("Add at least one pump selection to the schedule first."); return; }
  $("supplier-email-panel").hidden = false;
  $("pj-email").setAttribute("aria-expanded", "true");
  refreshSupplierEmail();
  $("supplier-email-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}
async function copySupplierEmail() {
  if (!pumpSelections().length) return;
  refreshSupplierEmail();
  const email = supplierEnquiry();
  const text = `Subject: ${email.subject}\n\n${email.body}`;
  try {
    await navigator.clipboard.writeText(text);
    toast("Supplier enquiry copied — paste it into your email.");
  } catch (e) {
    const el = $("email-body");
    el.value = text;
    el.focus();
    el.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch (_) { /* manual copy below */ }
    toast(copied ? "Supplier enquiry copied — paste it into your email." : "Email text selected — use your device's Copy command.");
  }
}
function utf8Base64(text) { return btoa(Array.from(new TextEncoder().encode(text), (b) => String.fromCharCode(b)).join("")); }
function emailHeader(text) {
  const chunks = [];
  let chunk = "";
  for (const char of text.replace(/[\r\n]/g, " ")) {
    if (new TextEncoder().encode(chunk + char).length > 42) { chunks.push(chunk); chunk = ""; }
    chunk += char;
  }
  if (chunk) chunks.push(chunk);
  return chunks.map((part) => `=?UTF-8?B?${utf8Base64(part)}?=`).join("\r\n ");
}
function supplierEmailFile(email) {
  const body = utf8Base64(email.body.replace(/\r?\n/g, "\r\n")).match(/.{1,76}/g).join("\r\n");
  return `X-Unsent: 1\r\nSubject: ${emailHeader(email.subject)}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${body}\r\n`;
}
function downloadSupplierEmail() {
  if (!pumpSelections().length) return;
  refreshSupplierEmail();
  download(new Blob([supplierEmailFile(supplierEnquiry())], { type: "message/rfc822" }), fileBase("Pump enquiry") + ".eml");
  toast("Email file downloaded — open it in your email app or attach it to your enquiry.");
}
function exportCsv() {
  if (!P.selections.length) { toast("Add at least one selection to the schedule first."); return; }
  const rows = [["Ref", "Service", "Type", "Liquid", "Total set flow (L/s)", "Total set flow (m3/h)", "Required head (kPa)", "Required head (m)", "Arrangement", "Pumps / units installed", "Running", "Standby", "Duty flow per pump / unit (L/s)", "Duty flow per pump / unit (m3/h)", "Head per pump / unit (kPa)", "Head per pump / unit (m)", "Control", "Set point", "Sensor", "Control notes", "Supply", "Motor per pump / unit (kW)", "Motor class", "Electrical / other notes"]];
  P.selections.forEach((s) => {
    const m = s.summary;
    const headM = m.headM === null ? "" : m.headM.toFixed(2);
    rows.push([s.ref, s.service, m.kind, m.fluid, m.flowTotal.toFixed(2), (m.flowTotal * 3.6).toFixed(2), m.head.toFixed(1), headM, arrangementText(m), m.nRun + m.nStby, m.nRun, m.nStby, m.flowEach.toFixed(2), (m.flowEach * 3.6).toFixed(2), m.head.toFixed(1), headM, m.control, m.setpoint, m.sensor, s.controlNotes || "", m.supply, m.motorKw, m.motorClass, s.notes || ""]);
  });
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  download(new Blob(["﻿" + csv], { type: "text/csv" }), fileBase("Duty list") + ".csv");
}

function arrangementText(m) {
  const units = m.kind === "fan" ? "fans" : "pumps";
  const roles = m.nRun > 1 ? (m.nStby ? "Duty / assist / standby" : "Duty / assist") : (m.nStby ? "Duty / standby" : "Single duty");
  return `${roles}: ${m.nRun + m.nStby} ${units} (${m.nRun} running${m.nStby ? " + " + m.nStby + " standby" : "; no standby"})`;
}

// ---------- PDF schedule ----------
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const el = document.createElement("script");
    el.src = src;
    el.onload = res;
    el.onerror = () => rej(new Error("Could not load " + src));
    document.head.appendChild(el);
  });
}
async function dataUrl(url) {
  const blob = await (await fetch(url)).blob();
  return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
}
// jsPDF's built-in fonts only cover Latin-1, so swap the few symbols the tool uses for plain text.
function pdfText(v) {
  return String(v ?? "")
    .replace(/η/g, "eff").replace(/Δ/g, "d").replace(/√/g, "sqrt").replace(/≈/g, "~").replace(/→/g, "->").replace(/[−–]/g, "-")
    .replace(/—/g, "-").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/∝/g, "prop. to").replace(/ṁ/g, "m").replace(/⚠/g, "!")
    .replace(/…/g, "...").replace(/[₀-₉]/g, (d) => String(d.charCodeAt(0) - 0x2080)).replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[^\x00-\xff]/g, "");
}
async function exportPdf() {
  if (!P.selections.length) { toast("Add at least one selection to the schedule first."); return; }
  toast("Building the PDF…");
  try {
    await loadScript("./lib/jspdf.umd.min.js");
    await loadScript("./lib/jspdf.plugin.autotable.min.js");
  } catch (e) {
    toast("PDF library could not load — open the tool online once so it is saved for offline use.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const [logo, footer] = await Promise.all([dataUrl("./assets/adi-logo.jpg"), dataUrl("./assets/adi-footer.jpg")]);
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const pj = Object.fromEntries(PJ_FIELDS.map((id) => [id.slice(3), pdfText($(id).value.trim())]));
  const dateTxt = pj.date ? new Date(pj.date + "T12:00:00").toLocaleDateString("en-GB") : new Date().toLocaleDateString("en-GB");
  const kinds = new Set(P.selections.map((s) => s.summary.kind));
  const title = kinds.size > 1 ? "Pump & fan schedule" : kinds.has("fan") ? "Fan schedule" : "Pump schedule";
  const BLACK = [0, 0, 0];
  const SKY = [143, 209, 243];
  const TOP = 38;

  const header = () => {
    doc.addImage(logo, "JPEG", 10, 7, 60, 60 * 176 / 554);
    doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(0);
    doc.text(title, W - 10, 13, { align: "right" });
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(60);
    const lines = [
      `${pj.name || "Untitled project"}${pj.number ? `  |  Project ${pj.number}` : ""}`,
      `${pj.client ? `Client: ${pj.client}  |  ` : ""}Engineer: ${pj.engineer || "-"}  |  Rev ${pj.rev || "-"}  |  ${dateTxt}`
    ];
    lines.forEach((l, i) => doc.text(l, W - 10, 19 + i * 4.5, { align: "right" }));
    doc.setDrawColor(...SKY).setLineWidth(0.8).line(10, 32, W - 10, 32);
  };
  const footerFn = () => {
    const fw = 150;
    doc.addImage(footer, "JPEG", 10, H - 4 - fw * 113 / 1098, fw, fw * 113 / 1098);
    doc.setFontSize(7).setTextColor(110);
    doc.text(`Page ${doc.internal.getNumberOfPages()}`, W - 10, H - 6, { align: "right" });
    doc.text("Generated by Flow2kW - estimates for design; confirm against the manufacturer's selection and motor nameplate.", W - 10, H - 10, { align: "right" });
  };
  const base = {
    theme: "grid",
    margin: { top: TOP + 6, left: 10, right: 10, bottom: 24 },
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 1.4, lineColor: [210, 214, 220], lineWidth: 0.1, textColor: 20, overflow: "linebreak" },
    headStyles: { fillColor: BLACK, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [239, 248, 253] },
    didDrawPage: () => { header(); footerFn(); }
  };
  // Start a section on a fresh page if its heading plus a few rows won't fit under the current table.
  const section = (label, y, rows = 3) => {
    if (y + 14 + rows * 7 > H - 26) {
      doc.addPage();
      header();
      footerFn();
      y = TOP + 4;
    }
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0);
    doc.text(label, 10, y);
    return y + 2;
  };
  const f = (n, d = 1) => Number.isFinite(n) ? n.toFixed(d) : "-";
  const sels = P.selections.map((s) => ({ s, m: s.summary }));

  let y = section(title, TOP + 4);
  doc.autoTable({
    ...base, startY: y,
    head: [["Ref", "Service", "Type / unit", "Medium", "Flow total\nL/s", "Arrangement", "Flow each\npump / fan L/s", "Head across\neach unit", "Unit eff\n%", "Shaft each\nkW", "Motor each\nkW", "Motor", "Drive", "Input each\nkW", "Input total\nkW"]],
    body: sels.map(({ s, m }) => [s.ref, s.service || "-", m.machine, m.fluid, f(m.flowTotal, 2), arrangementText(m), f(m.flowEach, 2), pressText(m), f(m.unitEff, 0) + (m.bundled ? " (overall)" : ""), f(m.shaftEach, 2), m.motorKw, `${m.motorClass} ${f(m.motorEff, 1)}%`, m.driveType, f(m.elecEach, 2), f(m.elecTotal, 2)].map(pdfText)),
    columnStyles: { 0: { fontStyle: "bold" }, 2: { cellWidth: 38 } }
  });

  y = section("Electrical requirements", doc.lastAutoTable.finalY + 8, Math.min(sels.length, 4));
  doc.autoTable({
    ...base, startY: y,
    head: [["Ref", "Supply", "Motors\ninstalled / running", "Motor rating\nkW each", "Start / drive", "PF", "Running\nA each", "Full load\nA each", "Connected\nload kW", "Max demand\nkW (full load)", "Notes"]],
    body: sels.map(({ s, m }) => [s.ref, m.supply, `${m.nRun + m.nStby} / ${m.nRun}`, m.motorKw, m.driveType, f(m.pf, 2), f(m.ampsEach, 1), f(m.flcEach, 1), f(m.connectedKw, 1), f(m.maxDemandKw, 1), [s.notes, ...m.warnings].filter(Boolean).join(" | ") || "-"].map(pdfText)),
    columnStyles: { 0: { fontStyle: "bold" }, 10: { cellWidth: 70 } }
  });

  y = section("Controls", doc.lastAutoTable.finalY + 8, Math.min(sels.length, 4));
  doc.autoTable({
    ...base, startY: y,
    head: [["Ref", "Control mode", "Set point", "Sensor", "Speed control", "BMS interface", "Duty / standby", "Control notes"]],
    body: sels.map(({ s, m }) => [s.ref, m.control, m.setpoint, m.sensor, m.driveType === "DOL" || m.driveType === "Belt, DOL" ? "None (fixed speed)" : m.driveType, s.bms, m.changeover, s.controlNotes || "-"].map(pdfText)),
    columnStyles: { 0: { fontStyle: "bold" } }
  });

  y = section("Annual energy (estimate)", doc.lastAutoTable.finalY + 8, Math.min(sels.length + 1, 5));
  const anyUpgrade = sels.some(({ m }) => m.upgrade);
  doc.autoTable({
    ...base, startY: y,
    head: [["Ref", "Load profile", "Hours / yr", "Wire-to-unit %", "kWh / yr", "GBP / yr", "kg CO2 / yr", ...(anyUpgrade ? ["Existing kWh / yr", "Saving GBP / yr", "Payback yr"] : [])]],
    body: sels.map(({ s, m }) => [s.ref, m.profile, f(m.hours, 0), f(m.w2w, 1), f(m.kwh, 0), f(m.gbp, 0), f(m.co2, 0), ...(anyUpgrade ? (m.upgrade ? [f(m.upgrade.existingKwh, 0), f(m.upgrade.saveGbp, 0), m.upgrade.saveGbp > 0 ? f(m.upgrade.payback, 1) : "-"] : ["-", "-", "-"]) : [])].map(pdfText)),
    foot: [["Total", "", "", "", f(sels.reduce((a, { m }) => a + m.kwh, 0), 0), f(sels.reduce((a, { m }) => a + m.gbp, 0), 0), f(sels.reduce((a, { m }) => a + m.co2, 0), 0), ...(anyUpgrade ? ["", f(sels.reduce((a, { m }) => a + (m.upgrade ? m.upgrade.saveGbp : 0), 0), 0), ""] : [])]],
    footStyles: { fillColor: SKY, textColor: 0, fontStyle: "bold" },
    showFoot: "lastPage",
    columnStyles: { 0: { fontStyle: "bold" } }
  });

  // One page of working per selection.
  sels.forEach(({ s }) => {
    doc.addPage();
    header();
    footerFn();
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0);
    doc.text(pdfText(`${s.ref}${s.service ? " - " + s.service : ""}: calculation notes`), 10, TOP + 4);
    doc.setFont("courier", "normal").setFontSize(7).setTextColor(30);
    const lines = doc.splitTextToSize(pdfText(s.note), W - 20);
    const maxLines = Math.floor((H - 26 - (TOP + 9)) / 3);
    doc.text(lines.slice(0, maxLines), 10, TOP + 9, { lineHeightFactor: 1.2 });
  });

  doc.save(fileBase(title) + ".pdf");
  toast("PDF saved.");
}

// ---------- wiring ----------
function afterUpdate() {
  if (P.restoring) return;
  refreshProjectUi();
  scheduleAutosave();
}
window.afterUpdate = afterUpdate;
$("control-notes").addEventListener("input", update);

$("pj-new").addEventListener("click", newProject);
$("pj-open").addEventListener("click", () => $("pj-file").click());
$("pj-file").addEventListener("change", async () => {
  const file = $("pj-file").files[0];
  $("pj-file").value = "";
  if (!file) return;
  try {
    loadProject(JSON.parse(await file.text()));
  } catch (e) {
    toast("That file couldn't be opened — it isn't a Flow2kW project (.json).");
  }
});
$("pj-save").addEventListener("click", saveProjectFile);
$("pj-pdf").addEventListener("click", () => exportPdf().catch((e) => toast("PDF failed: " + e.message)));
$("pj-csv").addEventListener("click", exportCsv);
$("pj-email").addEventListener("click", openSupplierEmail);
$("email-supplier").addEventListener("input", refreshSupplierEmail);
$("email-refresh").addEventListener("click", refreshSupplierEmail);
$("email-copy").addEventListener("click", copySupplierEmail);
$("email-download").addEventListener("click", downloadSupplierEmail);
$("email-close").addEventListener("click", () => {
  $("supplier-email-panel").hidden = true;
  $("pj-email").setAttribute("aria-expanded", "false");
  $("pj-email").focus();
});
$("sel-save").addEventListener("click", () => saveSelection(false));
$("sel-next").addEventListener("click", () => saveSelection(true));
$("finish-save").addEventListener("click", () => saveSelection(false));
$("finish-next").addEventListener("click", () => saveSelection(true));
$("sched-body").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  if (btn.dataset.act === "edit") editSelection(btn.dataset.id);
  if (btn.dataset.act === "copy") copySelection(btn.dataset.id);
  if (btn.dataset.act === "del") deleteSelection(btn.dataset.id);
});

// Restore the last session in this browser, if there is one.
rememberDraft();
(function restore() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || "null"); } catch (e) { saved = null; }
  if (!$("pj-date").value) $("pj-date").value = new Date().toISOString().slice(0, 10);
  if (saved && (saved.selections?.length || saved.project?.name)) {
    try {
      loadProject(saved, { quiet: true });
      toast(`Restored ${saved.project?.name || "your last project"} from this browser.`);
      return;
    } catch (e) { /* fall through to a fresh start */ }
  }
  refreshProjectUi();
})();
