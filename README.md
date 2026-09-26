# Flow2kW - Hydronic & Air Defence Calculator

PWA tool for HVAC / Building Services engineers to quickly defend pump & fan energy.

**Live demo:** Enable GitHub Pages on this repo (Settings > Pages > main / root) → https://mikesweet23.github.io/pumpandfan/

### Features
- **Projects (adi Climate Systems):** project name, number, client, engineer, revision and date. Several pump / fan selections per project, each with a ref (P-01, F-01…), service, BMS interface and controls / electrical notes
  - **Add to schedule** only once the key settings are confirmed; **Edit**, **Copy** or **Delete** any line; "Start next selection" carries the current inputs forward
  - **Save project (.json)** / **Open…** — reopening recalculates every selection with the current version of the tool
  - Autosaved in the browser (restored when you reopen the app); use the JSON file to keep or share a project
  - **PDF schedule** (A4 landscape, adi logo and letterhead footer): pump / fan schedule, electrical requirements (supply, motors installed / running, rating, drive, PF, running and full-load amps, connected load, max demand), controls (mode, set point, sensor, speed control, BMS interface, duty / standby), annual energy, and a page of calculation notes per selection. Built in the browser with the bundled jsPDF, so it works offline
  - **Duty list (.csv)** — per-unit flow (L/s and m³/h), head (kPa and m), liquid, running / standby, for sizing in Grundfos Product Centre or other selection software
- **Fluid toggle:** Water | Glycol Mix (EG/PG %) | Air — temperature slider affects density
- **Thermal kW from Flow & ΔT:** Q = ṁ·Cp·ΔT with glycol & temp corrections (ρ, Cp shown)
- **2026 catalogue defaults** for existing plant, with older and premium options still available:
  - Pumps: Pre-1975 42% up to 2026 typical packaged 78% and 2026 premium best-in-class hydraulics 81% at the duty point (motor and drive losses always added). Checked against Sept 2026 Grundfos TP / TPE2 selections: 74–79% pump η, 67–72% wire-to-water
  - Fans: 1970s forward curved 45% up to 2026 typical EC plug 66% and premium EC 72% overall wire-to-air (ErP ηe, motor and electronics included)
  - Motors: Pre-IE, IE1–IE5, default **IE4 Super Premium** — efficiency looked up by rated kW from IEC 60034-30-1 (4-pole), e.g. IE4 is 85.7% at 0.75 kW but 96.0% at 75 kW
  - Drives: Direct, belt old/new, **VSD 97% (2026 typical)**, integrated EC electronics
  - Era chips: 2026 typical | 2026 premium | 2010s | 1990s | Legacy / worn
- **Duty / assist / standby:** enter the total flow and the number of pumps running; flow is split between them. Motor rating and current are per pump, kW / kWh / £ are totals; standby pumps are counted but carry no load
- **Load profile:** flat (full duty all hours) or variable heating — Grundfos standard 25 / 50 / 75 / 100% flow for 44 / 35 / 15 / 6% of 6840 h. Fixed-speed plant rides its curve (≈ 50% + 50% × flow)
- **Job type:** Upgrade existing, or **new installation** (no existing plant — ratings and affinity use the proposed machine only)
- **Typical IEC motor / pump frames** auto-selected from duty for existing and proposed:
  - Small commercial: 0.75, 1.1, 1.5, 2.2, 3.0, 4.0, 5.5 kW — AHU coils, boiler shunts, local zones
  - Medium commercial: 7.5, 11, 15, 18.5, 22, 30 kW — offices, secondary LTHW/CHW, modular chillers
  - Large commercial / institutional: 37, 45, 55, 75 kW
  - Frame = next catalogue size ≥ 1.10 × motor shaft with a VSD / EC, 1.25 × with fixed speed (must cover its full-speed curve); overridable
  - Overview shows the Small / Medium / Large catalogue and highlights the band the duty lands in
- **Proposed side** defaults to 2026 premium (EC / IE5 / VSD) so the comparison is ready on first open
- **Actual data mode:** Enter measured flow, head, electrical kW (or V·A·PF) to back-calc wire-to-water eff
- **Power chain for each plant:** water power → pump shaft power → motor rating (nameplate kW) → electrical input → running current → full-load current
- **Electrical supply:** 3-phase or 1-phase, volts and power factor (auto: 0.87 on a VSD / EC — matches Grundfos TPE2 nameplate currents — or typical motor PF for DOL). Current shown at duty, at full nameplate load, and at every affinity speed
- **Results overview:** existing vs proposed kW, amps, wire-to-water %, annual kWh, £/yr, CO₂
- **Quick method:** step-by-step from L/s and kPa to motor kW and amps, with calculator key sequences and rules of thumb, using the live numbers
- **Key settings bar:** job, system, fluid, pumps running, control mode(s), load profile and supply are tagged **KEY** (amber) and summarised at the top. Copy / Export of the defence note stay locked until "I've checked these settings" is ticked; changing any key setting locks them again and flashes the chip that changed. Conflicts (e.g. a variable-flow control with no VSD, running above 50 Hz, below minimum speed) show in red
- **System & pump control (section 2)** — set separately for existing and proposed plant:
  - **Constant DP at the pump** (default for pumps) — head held, power ≈ flow; the pump barely slows (~92% speed at half flow)
  - **Proportional pressure** (set % at zero flow, default 50%) — matches Grundfos TPE2 part-load data
  - **Constant DP at the index circuit** (set point, default 30% of head) — friction savings come back
  - **Open circuit / static lift** (static %, default 40%) — limited savings, flow stops below a minimum speed
  - **No pressure control — cube law** (default for fans) — flow ∝ N, head ∝ N², power ∝ N³
  - **Fixed speed — no VSD** — rides the pump curve, ≈ 50% + 50% × flow. Any variable mode on a plant without a VSD / EC is calculated as fixed speed and flagged
  - Each option shows a live "at 50% flow" power and speed
- **Affinity explorer:** the slider is flow % (speed = flow for the cube law). Pump speed is worked out from a pump curve (shut-off head ÷ duty head, default 1.25). Includes pump η away from best efficiency and motor / drive part-load losses, calibrated to the Grundfos 25% point. Flow 20–120%, with >50 Hz and below-minimum-speed rows flagged
  - **Comparison strip:** the same flow under every control option — speed, head, power, £/yr at that flow, annual £ on the load profile and the saving vs DP at the pump
  - Toggle the table between **existing** and **proposed** (locked to proposed on a new install)
- **Extras:** Pipe/duct velocity check, glycol correction, copy-ready defence note
- **Working & Learning box:** Every formula shown with live numbers for an audit trail

### How to use
1. The calculator opens as a **new installation** — 2.5 L/s at 150 kPa, ΔT 20 K — on a 2026 premium pump + IE5 + VSD (or EC plug fan in air/fan mode). Switch to **Upgrade existing** to compare against old plant
2. Change era or pick any catalogue item if the existing plant is older, worn, or a premium EC machine
3. Set flow, temperature, glycol % if needed, ΔT and head → thermal and hydraulic kW
4. Review existing vs 2026 premium proposed savings
5. Move the affinity speed slider (or click a table row / chart bar) to see how each % change hits kW, kWh, £, CO₂ and motor-frame load
6. Toggle affinity to **Proposed** (or choose **New installation**) when there is no existing pump

### Install as PWA
Chrome/Edge on desktop or phone → Install icon in address bar. Works offline.

**Updates:** opening the app online always loads the latest version (the page is fetched network-first; the saved copy is only used offline). If a new version is published while the app is open, an **"A new version of Flow2kW is ready — Update now"** bar appears; tap it to reload into the new version. The footer shows the version running (e.g. `Version v10`). Bump `CACHE` in `sw.js` with every release.

### Tech
Single-page HTML/CSS/JS, no build needed. Just `index.html`.

### Upload to GitHub
1. Create repo `pumpandfan`
2. Upload all files in this folder
3. Settings > Pages > Deploy from main / root
4. Done.

MIT - use freely for site work.
