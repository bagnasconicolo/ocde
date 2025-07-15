/* ------------------ CONFIG ------------------ */
const FALLBACK_TRACK_FILES = [
  "data/Track 11 Jul 2025 22-19-23.rctrk",
];

window.addEventListener("load", () => {
  /* ------------------ MAP ------------------ */
  const map = L.map("map", {
    worldCopyJump: true,
    attributionControl: false,
    zoomControl: false,
    renderer: L.canvas(),
  }).setView([20, 0], 2);

  const baseLayers = {
    dark: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 20, attribution: "&copy; OpenStreetMap & CartoDB" }
    ),
    light: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 20, attribution: "&copy; OpenStreetMap & CartoDB" }
    ),
    topo: L.tileLayer(
      "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 17,
        attribution:
          "Map data &copy; OpenStreetMap contributors, SRTM | Map style &copy; OpenTopoMap (CC-BY-SA)",
      }
    ),
    osm: L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }
    ),
    hot: L.tileLayer(
      "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
      { maxZoom: 20, attribution: "&copy; OpenStreetMap contributors, HOT" }
    ),
  };
  let currentBase = baseLayers.dark.addTo(map);
  document.getElementById("basemapSelect").addEventListener("change", (e) => {
    const key = e.target.value;
    if (baseLayers[key]) {
      map.removeLayer(currentBase);
      currentBase = baseLayers[key].addTo(map);
    }
  });
  L.control.zoom({ position: "bottomleft" }).addTo(map);
  L.control.scale({ position: "bottomleft" }).addTo(map);
  L.control.attribution({ position: "bottomright" }).addTo(map);

  const coordsControl = L.control({ position: "bottomright" });
  coordsControl.onAdd = function () {
    this._div = L.DomUtil.create("div", "leaflet-control-coordinate");
    this._div.innerHTML = "Lat: -- Lon: --";
    return this._div;
  };
  coordsControl.addTo(map);
  map.on("mousemove", (e) => {
    coordsControl._div.innerHTML = `Lat: ${e.latlng.lat.toFixed(5)} Lon: ${e.latlng.lng.toFixed(5)}`;
  });

  /* ------------------ STATE ------------------ */
  const allPoints = [];
  const tracks = {};
  let nextHue = 0;
  const nextTrackColor = () => {
    const color = `hsl(${nextHue}, 100%, 50%)`;
    nextHue = (nextHue + 137.508) % 360;
    return color;
  };
  const pointLayer = L.layerGroup().addTo(map);
  const lineLayer = L.layerGroup().addTo(map);
  const trackListElem = document.getElementById("trackList");
  const sidebar = document.getElementById("sidebar");
  const trackViewToggle = document.getElementById("trackViewToggle");
  const startTimeInput = document.getElementById("startTime");
  const endTimeInput = document.getElementById("endTime");
  const trackPopup = document.getElementById("trackPopup");
  const trackPopupContent = document.getElementById("trackPopupContent");
  document
    .getElementById("trackPopupClose")
    .addEventListener("click", () =>
      trackPopup.classList.add("hidden")
    );
  let trackView = false;
  let globalMinDate = Infinity;
  let globalMaxDate = -Infinity;

  document
    .getElementById("toggleSidebar")
    .addEventListener("click", () =>
      sidebar.classList.toggle("-translate-x-full")
    );

  /* ------------------ HELPERS ------------------ */
  const fetchTrackList = async () => {
    try {
      const res = await fetch("data/track_index.json");
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      console.warn("track_index.json missing → fallback list");
      return FALLBACK_TRACK_FILES;
    }
  };

  const parseFile = (text) => {
    // .rctrk JSON
    try {
      const js = JSON.parse(text);
      if (Array.isArray(js.markers)) {
        return js.markers
          .map((m) => ({
            lat: +m.lat,
            lon: +m.lon,
            dose: +(m.doseRate ?? m.dose_uSv_h ?? m.dose ?? 0),
            cps: +(m.countRate ?? m.cps ?? 0),
            energy: +(m.energy ?? m.energyValue ?? m.energy_ev ?? NaN),
            date: +m.date || 0,
          }))
          .filter((p) => !isNaN(p.lat) && !isNaN(p.lon));
      }
    } catch (_) {}
    // CSV fallback (lat lon dose cps energy?)
    const parsed = Papa.parse(text.trim(), {
      dynamicTyping: true,
      skipEmptyLines: true,
    });
    return parsed.data
      .filter((r) => r.length >= 4)
      .map((r) => ({
        lat: +r[0],
        lon: +r[1],
        dose: +r[2],
        cps: +r[3],
        energy: +r[4] || NaN,
        date: 0,
      }))
      .filter((p) => !isNaN(p.lat) && !isNaN(p.lon));
  };

  const colorScale = (val, min, max) => {
    if (val === 0) return "#777"; // zero measurements grey
    const t = Math.max(0, Math.min(1, (val - min) / (max - min || 1e-9)));
    let r, g;
    if (t <= 0.5) {
      r = Math.round(t * 2 * 255); // green -> yellow
      g = 255;
    } else {
      r = 255;
      g = Math.round(255 * (1 - (t - 0.5) * 2)); // yellow -> red
    }
    return `rgb(${r},${g},0)`;
  };

  const animateCounter = (el, value, decimals = 0) => {
    if (!el) return;
    const duration = 600;
    const step = 16;
    const steps = duration / step;
    let current = 0;
    const inc = value / steps;
    const timer = setInterval(() => {
      current += inc;
      if (current >= value) {
        current = value;
        clearInterval(timer);
      }
      el.textContent = current.toFixed(decimals);
    }, step);
  };

  const filterByDate = (points) => {
    if (globalMinDate === Infinity) return points;
    const start = startTimeInput.valueAsNumber || globalMinDate * 1000;
    const end = endTimeInput.valueAsNumber || globalMaxDate * 1000;
    return points.filter(
      (p) => p.date * 1000 >= start && p.date * 1000 <= end
    );
  };

  const computeStats = (pts) => {
    const filtered = pts.filter((p) => p.dose !== 0 || p.cps !== 0);
    if (!filtered.length)
      return {
        avgDose: 0,
        minDose: 0,
        maxDose: 0,
        avgCps: 0,
        minCps: 0,
        maxCps: 0,
      };
    const doses = filtered.map((p) => p.dose);
    const cpses = filtered.map((p) => p.cps);
    return {
      avgDose: doses.reduce((a, b) => a + b, 0) / doses.length,
      minDose: Math.min(...doses),
      maxDose: Math.max(...doses),
      avgCps: cpses.reduce((a, b) => a + b, 0) / cpses.length,
      minCps: Math.min(...cpses),
      maxCps: Math.max(...cpses),
    };
  };

  /* ------------------ MAIN LOAD ------------------ */
  (async () => {
    const files = await fetchTrackList();
    const bounds = [];

    for (const fname of files) {
      try {
        const res = await fetch(fname);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const pts = parseFile(await res.text());
        if (!pts.length) throw new Error("no data");
        pts.sort((a, b) => a.date - b.date);

        pts.forEach((p) => {
          p.fname = fname;
          bounds.push([p.lat, p.lon]);
          allPoints.push(p);
          if (p.date) {
            globalMinDate = Math.min(globalMinDate, p.date);
            globalMaxDate = Math.max(globalMaxDate, p.date);
          }
        });

        // line: connect points in chronological order
        const path = pts.map((p) => [p.lat, p.lon]);
        const color = nextTrackColor();
        const line = L.polyline(path, {
          color,
          weight: 3,
          opacity: 0.7,
        });
        tracks[fname] = { points: pts, line, visible: true, color };
        const li = document.createElement("li");
        li.innerHTML =
          `<label class='flex items-center gap-2 text-gray-200'><input type='checkbox' class='trackCheck accent-blue-500' data-file='${fname}' checked><span class='inline-block w-3 h-3 rounded-full' style='background:${color}'></span> ${fname.split("/").pop()}</label>`;

        trackListElem.appendChild(li);



        // IDs for elements
        const uid = btoa(fname).replace(/[^A-Za-z0-9]/g, "");
        const plotCpsId = `plot-cps-${uid}`;
        const histCpsId = `hist-cps-${uid}`;
        const sliderCpsId = `slider-cps-${uid}`;
        const plotDoseId = `plot-dose-${uid}`;
        const histDoseId = `hist-dose-${uid}`;
        const sliderDoseId = `slider-dose-${uid}`;

        line.on("click", () => {
          let filtered = filterByDate(pts);
          if (!filtered.length) filtered = pts;
          const stats = computeStats(filtered);
          trackPopupContent.innerHTML = `
            <button id='trackPopupClose' class='absolute top-2 right-2 text-gray-300 hover:text-white'>✕</button>
            <div class='prose prose-sm prose-invert max-w-none mb-4'>
              <h3 class='text-lg font-semibold'>${fname.split("/").pop()}</h3>
            </div>
            <div class='grid grid-cols-3 gap-2 sm:gap-4 mb-4 text-center text-xs sm:text-sm'>
              <div class='bg-gray-900/40 p-2 rounded-lg shadow'>
                <div class='text-gray-400'>Dose min</div>
                <div id='stat-min-dose-${uid}' class='text-lg font-semibold text-sky-400'>0</div>
                <div class='text-gray-400'>µSv/h</div>
              </div>
              <div class='bg-gray-900/40 p-2 rounded-lg shadow'>
                <div class='text-gray-400'>Dose avg</div>
                <div id='stat-avg-dose-${uid}' class='text-lg font-semibold text-sky-400'>0</div>
                <div class='text-gray-400'>µSv/h</div>
              </div>
              <div class='bg-gray-900/40 p-2 rounded-lg shadow'>
                <div class='text-gray-400'>Dose max</div>
                <div id='stat-max-dose-${uid}' class='text-lg font-semibold text-sky-400'>0</div>
                <div class='text-gray-400'>µSv/h</div>
              </div>
              <div class='bg-gray-900/40 p-2 rounded-lg shadow'>
                <div class='text-gray-400'>CPS min</div>
                <div id='stat-min-cps-${uid}' class='text-lg font-semibold text-amber-400'>0</div>
                <div class='text-gray-400'>cps</div>
              </div>
              <div class='bg-gray-900/40 p-2 rounded-lg shadow'>
                <div class='text-gray-400'>CPS avg</div>
                <div id='stat-avg-cps-${uid}' class='text-lg font-semibold text-amber-400'>0</div>
                <div class='text-gray-400'>cps</div>
              </div>
              <div class='bg-gray-900/40 p-2 rounded-lg shadow'>
                <div class='text-gray-400'>CPS max</div>
                <div id='stat-max-cps-${uid}' class='text-lg font-semibold text-amber-400'>0</div>
                <div class='text-gray-400'>cps</div>
              </div>
            </div>
            <div class='grid md:grid-cols-2 md:grid-rows-2 gap-4 text-white'>
              <div class='bg-gray-900/40 p-4 rounded-lg shadow'>
                <label class='block text-xs mb-1'>CPS Avg window: <span id='valCps-${uid}'>1</span></label>
                <input type='range' min='1' max='50' value='1' id='${sliderCpsId}' class='w-full mb-2 accent-teal-500'>
                <div id='${plotCpsId}' class='w-full h-96'></div>
              </div>
              <div class='bg-gray-900/40 p-4 rounded-lg shadow'>
                <h4 class='text-sm font-semibold mb-2'>CPS histogram</h4>
                <div id='${histCpsId}' class='w-full h-96'></div>
              </div>
              <div class='bg-gray-900/40 p-4 rounded-lg shadow'>
                <label class='block text-xs mb-1'>Dose Avg window: <span id='valDose-${uid}'>1</span></label>
                <input type='range' min='1' max='50' value='1' id='${sliderDoseId}' class='w-full mb-2 accent-teal-500'>
                <div id='${plotDoseId}' class='w-full h-96'></div>
              </div>
              <div class='bg-gray-900/40 p-4 rounded-lg shadow'>
                <h4 class='text-sm font-semibold mb-2'>Dose histogram</h4>
                <div id='${histDoseId}' class='w-full h-96'></div>
              </div>
            </div>`;
          trackPopup.classList.remove("hidden");
          document
            .getElementById("trackPopupClose")
            .addEventListener("click", () =>
              trackPopup.classList.add("hidden")
            );

          animateCounter(
            document.getElementById(`stat-min-dose-${uid}`),
            stats.minDose,
            3
          );
          animateCounter(
            document.getElementById(`stat-avg-dose-${uid}`),
            stats.avgDose,
            3
          );
          animateCounter(
            document.getElementById(`stat-max-dose-${uid}`),
            stats.maxDose,
            3
          );
          animateCounter(
            document.getElementById(`stat-min-cps-${uid}`),
            stats.minCps,
            1
          );
          animateCounter(
            document.getElementById(`stat-avg-cps-${uid}`),
            stats.avgCps,
            1
          );
          animateCounter(
            document.getElementById(`stat-max-cps-${uid}`),
            stats.maxCps,
            1
          );

          setTimeout(() => {
            const plotCpsDiv = document.getElementById(plotCpsId);
            const plotDoseDiv = document.getElementById(plotDoseId);
            if (!plotCpsDiv || !plotDoseDiv) return;
            const x = [...Array(filtered.length).keys()];
            const dosesArr = filtered.map((p) => p.dose);
            const cpsArr = filtered.map((p) => p.cps);

            const movingAvg = (arr, w) => {
              if (w <= 1) return arr;
              const out = [];
              let acc = 0;
              for (let i = 0; i < arr.length; i++) {
                acc += arr[i];
                if (i >= w) acc -= arr[i - w];
                out.push(acc / Math.min(i + 1, w));
              }
              return out;
            };

            const drawCps = (w) => {
              const vals = movingAvg(cpsArr, w);
              Plotly.react(
                plotCpsDiv,
                [
                  {
                    x,
                    y: vals,
                    name: "CPS",
                    type: "scatter",
                    mode: "lines",
                    line: {
                      width: 2,
                      color: vals,
                      colorscale: [
                        [0, "rgb(0,255,0)"],
                        [0.5, "rgb(255,255,0)"],
                        [1, "rgb(255,0,0)"],
                      ],
                      cmin: Math.min(...vals),
                      cmax: Math.max(...vals),
                    },
                  },
                ],
                {
                  margin: { l: 40, r: 40, t: 10, b: 30 },
                  paper_bgcolor: "#1f2937",
                  plot_bgcolor: "#1f2937",
                  font: { color: "#ffffff", size: 10 },
                  xaxis: {
                    title: "fix #",
                    showgrid: false,
                    rangeslider: { visible: true },
                  },
                  yaxis: { title: "cps", showgrid: false },
                },
                { responsive: true, displaylogo: false }
              );
              document.getElementById(`valCps-${uid}`).textContent = w;
            };

            const drawDose = (w) => {
              const vals = movingAvg(dosesArr, w);
              Plotly.react(
                plotDoseDiv,
                [
                  {
                    x,
                    y: vals,
                    name: "Dose (µSv/h)",
                    type: "scatter",
                    mode: "lines",
                    line: {
                      width: 2,
                      color: vals,
                      colorscale: [
                        [0, "rgb(0,255,0)"],
                        [0.5, "rgb(255,255,0)"],
                        [1, "rgb(255,0,0)"],
                      ],
                      cmin: Math.min(...vals),
                      cmax: Math.max(...vals),
                    },
                  },
                ],
                {
                  margin: { l: 40, r: 40, t: 10, b: 30 },
                  paper_bgcolor: "#1f2937",
                  plot_bgcolor: "#1f2937",
                  font: { color: "#ffffff", size: 10 },
                  xaxis: {
                    title: "fix #",
                    showgrid: false,
                    rangeslider: { visible: true },
                  },
                  yaxis: { title: "µSv/h", showgrid: false },
                },
                { responsive: true, displaylogo: false }
              );
              document.getElementById(`valDose-${uid}`).textContent = w;
            };

            const histCpsDiv = document.getElementById(histCpsId);
            Plotly.newPlot(
              histCpsDiv,
              [
                {
                  x: cpsArr,
                  type: "histogram",
                  opacity: 0.6,
                  marker: { color: "#f59e0b" },
                },
              ],
              {
                margin: { l: 30, r: 20, t: 10, b: 30 },
                paper_bgcolor: "#1f2937",
                plot_bgcolor: "#1f2937",
                font: { color: "#ffffff", size: 10 },
                xaxis: { title: "cps", showgrid: false },
                yaxis: { title: "freq", showgrid: false },
              },
              { responsive: true, displaylogo: false }
            );

            const histDoseDiv = document.getElementById(histDoseId);
            Plotly.newPlot(
              histDoseDiv,
              [
                {
                  x: dosesArr,
                  type: "histogram",
                  opacity: 0.6,
                  marker: { color: "#38bdf8" },
                },
              ],
              {
                margin: { l: 30, r: 20, t: 10, b: 30 },
                paper_bgcolor: "#1f2937",
                plot_bgcolor: "#1f2937",
                font: { color: "#ffffff", size: 10 },
                xaxis: { title: "µSv/h", showgrid: false },
                yaxis: { title: "freq", showgrid: false },
              },
              { responsive: true, displaylogo: false }
            );

            // sliders
            drawCps(1);
            drawDose(1);
            document.getElementById(sliderCpsId).addEventListener("input", (e) => drawCps(parseInt(e.target.value)));
            document.getElementById(sliderDoseId).addEventListener("input", (e) => drawDose(parseInt(e.target.value)));
          }, 120);
        });
      } catch (e) {
        console.warn("skip", fname, e.message);
      }
    }

    if (bounds.length) map.fitBounds(bounds, { padding: [50, 50] });
    if (globalMinDate !== Infinity) {
      startTimeInput.valueAsNumber = globalMinDate * 1000;
      endTimeInput.valueAsNumber = globalMaxDate * 1000;
    }
    drawDots();
  })();

  /* ------------------ DOT RENDER ------------------ */
  function drawDots() {
    const legend = document.getElementById("legend");
    if (trackView) {
      pointLayer.clearLayers();
      legend.classList.add("hidden");
      return;
    }
    const metric = document.getElementById("metricSelect").value;
    const visiblePoints = filterByDate(allPoints).filter(
      (p) => tracks[p.fname]?.visible
    );
    if (!visiblePoints.length) {
      pointLayer.clearLayers();
      legend.classList.add("hidden");
      return;
    }
    const filteredVals = visiblePoints.filter(
      (p) => p.dose !== 0 || p.cps !== 0
    );
    const sample = filteredVals.length ? filteredVals : visiblePoints;
    const vals = sample.map((p) => (metric === "dose" ? p.dose : p.cps));
    const min = Math.min(...vals);
    const max = Math.max(...vals);

    const legendLabel = document.getElementById("legend-label");
    const legendBar = document.getElementById("legend-bar");
    const legendMin = document.getElementById("legend-min");
    const legendMax = document.getElementById("legend-max");
    const decimals = metric === "dose" ? 3 : 1;
    legendLabel.textContent =
      metric === "dose" ? "Dose (µSv/h)" : "Counts (cps)";
    legendMin.textContent = min.toFixed(decimals);
    legendMax.textContent = max.toFixed(decimals);
    const cMin = colorScale(min, min, max);
    const cMid = colorScale((min + max) / 2, min, max);
    const cMax = colorScale(max, min, max);
    legendBar.style.background = `linear-gradient(to right, ${cMin}, ${cMid}, ${cMax})`;
    legend.classList.remove("hidden");

    pointLayer.clearLayers();
    visiblePoints.forEach((p) => {
      const valMetric = metric === "dose" ? p.dose : p.cps;
      const color = p.dose === 0 && p.cps === 0 ? "#777" : colorScale(valMetric, min, max);
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: 6,
        renderer: map.getRenderer(map),
        fillColor: color,
        color: color,
        fillOpacity: 0.5,
        weight: 0,
      }).addTo(pointLayer);

      const dateStr =
        p.date && !isNaN(p.date)
          ? new Date(p.date * 1000).toLocaleString()
          : "N/A";
      const hasEnergy = Number.isFinite(p.energy) && p.energy > 0;
      const cols = hasEnergy ? 3 : 2;
      let popupHtml = `<div class='prose prose-sm prose-invert'>`;
      popupHtml +=
        `<div class='grid grid-cols-${cols} gap-2 text-center text-xs'>` +
        `<div class='bg-gray-900/40 p-2 rounded-lg shadow'>` +
        `<div class='text-gray-400'>Dose</div>` +
        `<div class='text-lg font-semibold text-sky-400'>${p.dose.toFixed(3)}</div>` +
        `<div class='text-gray-400'>µSv/h</div>` +
        `</div>` +
        `<div class='bg-gray-900/40 p-2 rounded-lg shadow'>` +
        `<div class='text-gray-400'>CPS</div>` +
        `<div class='text-lg font-semibold text-amber-400'>${p.cps.toFixed(1)}</div>` +
        `<div class='text-gray-400'>cps</div>` +
        `</div>`;
      if (hasEnergy) {
        popupHtml +=
          `<div class='bg-gray-900/40 p-2 rounded-lg shadow'>` +
          `<div class='text-gray-400'>Energy</div>` +
          `<div class='text-lg font-semibold text-purple-400'>${p.energy.toFixed(1)}</div>` +
          `<div class='text-gray-400'>keV</div>` +
          `</div>`;
      }
      popupHtml += `</div>`;
      popupHtml += `<div class='mt-2 text-xs text-gray-400 text-center'>${dateStr}</div>`;
      popupHtml += `</div>`;
      marker.bindPopup(popupHtml);
    });
  }

  document
    .getElementById("metricSelect")
    .addEventListener("change", drawDots);
  trackListElem.addEventListener("change", (e) => {
    if (!e.target.dataset.file) return;
    const t = tracks[e.target.dataset.file];
    t.visible = e.target.checked;
    if (trackView) {
      if (t.visible) {
        lineLayer.addLayer(t.line);
      } else {
        lineLayer.removeLayer(t.line);
      }
    }
    drawDots();
  });

  startTimeInput.addEventListener("change", drawDots);
  endTimeInput.addEventListener("change", drawDots);

  trackViewToggle.addEventListener("change", () => {
    trackView = trackViewToggle.checked;
    if (trackView) {
      pointLayer.clearLayers();
      lineLayer.clearLayers();
      Object.values(tracks).forEach((t) => {
        if (t.visible) lineLayer.addLayer(t.line);
      });
    } else {
      lineLayer.clearLayers();
      drawDots();
    }

  });
});
