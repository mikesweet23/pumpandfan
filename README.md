# Flow2kW - Hydronic & Air Defence Calculator

PWA tool for HVAC / Building Services engineers to quickly defend pump & fan energy.

**Live demo:** Enable GitHub Pages on this repo (Settings > Pages > main / root) → https://YOURNAME.github.io/flow2kw/

### Features
- **Fluid toggle:** Water | Glycol Mix (EG/PG %) | Air - temperature slider affects density
- **Thermal kW from Flow & ΔT:** Q = ṁ·Cp·ΔT with glycol & temp corrections (ρ, Cp shown)
- **Pump/Fan defence presets:**
  - Pumps: Pre-1975 42% up to Premium EC 87% + custom
  - Fans: 1970s forward curved 45% up to EC Plug 86%
  - Motors: Pre-IE 80%, IE1 85%, IE2 88.5%, IE3 92.5%, IE4 94.5%, IE5 96.5% (size corrected)
  - Drives: Direct, Belt old/new, VSD
- **Actual data mode:** Enter measured flow, head, electrical kW (or V·A·PF) to back-calc wire-to-water eff
- **Results:** Hydraulic power Ph = Q·ΔP, Shaft, Electrical, Wire-to-water %, annual kWh, £/yr, CO2
- **Defence comparison:** Existing vs Proposed (modern) with savings + copy-ready text for reports
- **Extras:** Pipe/Duct velocity check, affinity laws (N% scaling), glycol correction
- **Working & Learning box:** Every formula shown with live numbers for audit trail

### How to use
1. Select fluid, set flow, temp, glycol % if needed, ΔT → get thermal kW
2. Set head (m/kPa/bar for pumps, Pa for fans)
3. Pick age presets for pump/fan & motor → get electrical kW
4. Set hours, £/kWh, compare to new → copy defence text

### Install as PWA
Chrome/Edge on desktop or phone → Install icon in address bar. Works offline.

### Tech
Single-page React + Tailwind, no build needed. Just `index.html`.

### Upload to GitHub
1. Create repo `flow2kw`
2. Upload all files in this folder
3. Settings > Pages > Deploy from main / root
4. Done.

MIT - use freely for site work.
