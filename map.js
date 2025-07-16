/* ------------------ CONFIG ------------------ */
const FALLBACK_TRACK_FILES = [
  "data/Track 11 Jul 2025 22-19-23.rctrk",
];

window.addEventListener("load", () => {
  const styleElem = document.createElement("style");
  styleElem.textContent = `.track-line, .glass-dot { filter: drop-shadow(0 0 2px #000); }`;
  document.head.appendChild(styleElem);
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
  let baseIsDark = true;
  document.getElementById("basemapSelect").addEventListener("change", (e) => {
    const key = e.target.value;
    if (baseLayers[key]) {
      map.removeLayer(currentBase);
      currentBase = baseLayers[key].addTo(map);
      baseIsDark = key === "dark";
      updateTrackColors();
    }
  });
  L.control.zoom({ position: "bottomleft" }).addTo(map);
  L.control.scale({ position: "bottomleft" }).addTo(map);
  L.control.attribution({ position: "bottomright" }).addTo(map);
  map.on("zoomend", drawDots);
  map.on("resize", drawDots);

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
  const trackLightnessDark = 60;
  const trackLightnessLight = 40;
  const trackColorForHue = (h) =>
    `hsl(${h}, 100%, ${baseIsDark ? trackLightnessDark : trackLightnessLight}%)`;
  const nextTrackHue = () => {
    const h = nextHue;
    nextHue = (nextHue + 137.508) % 360;
    return h;
  };
  const pointLayer = L.layerGroup().addTo(map);
  const lineLayer = L.layerGroup().addTo(map);
  const trackDotLayer = L.layerGroup();
  const trackListElem = document.getElementById("trackList");
  const sidebar = document.getElementById("sidebar");
  const trackViewToggle = document.getElementById("trackViewToggle");
  const startTimeInput = document.getElementById("startTime");
  const endTimeInput = document.getElementById("endTime");
  const lineStyleBtn = document.getElementById("lineStyleBtn");
  const lineStylePanel = document.getElementById("lineStylePanel");
  const lineStyleSelect = document.getElementById("lineStyleSelect");
  const lineWidthInput = document.getElementById("lineWidthInput");
  const lineOpacityInput = document.getElementById("lineOpacityInput");
  const lineShadowSlider = document.getElementById("lineShadowSlider");
  const showTrackDotsToggle = document.getElementById("showTrackDotsToggle");
  const dotOpacitySlider = document.getElementById("dotOpacitySlider");
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
  let lineDash = null;
  let lineWidth = 3;
  let lineOpacity = 0.7;
  let lineShadow = 2;
  let showTrackDots = false;
  let dotOpacity = 0.5;
  
  document
    .getElementById("toggleSidebar")
    .addEventListener("click", () =>
      sidebar.classList.toggle("-translate-x-full")
    );

  sidebar.querySelectorAll("details").forEach((d) => {
    let pinned = false;
    d.addEventListener("toggle", (e) => {
      if (e.isTrusted) pinned = d.open;
    });
    d.addEventListener("mouseenter", () => d.setAttribute("open", ""));
    d.addEventListener("mouseleave", () => {
      if (!pinned) d.removeAttribute("open");
    });
  });

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
      r = Math.round(t * 2 * 255); // dark green -> yellow
      g = Math.round(128 + t * 2 * 127); // start from darker green
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

  const aggregatePoints = (pts) => {
    const zoom = map.getZoom();
    const cellSize = zoom >= 12 ? 10 : zoom >= 10 ? 20 : zoom >= 8 ? 40 : zoom >= 6 ? 80 : 120;
    const cells = new Map();
    pts.forEach((p) => {
      const { x, y } = map.latLngToLayerPoint([p.lat, p.lon]);
      const key = `${Math.floor(x / cellSize)}_${Math.floor(y / cellSize)}`;
      let c = cells.get(key);
      if (!c)
        cells.set(
          key,
          (c = {
            lat: 0,
            lon: 0,
            dose: 0,
            cps: 0,
            energy: 0,
            eCount: 0,
            dateSum: 0,
            dateCount: 0,
            count: 0,
          })
        );
      c.lat += p.lat;
      c.lon += p.lon;
      c.dose += p.dose;
      c.cps += p.cps;
      if (Number.isFinite(p.energy) && p.energy > 0) {
        c.energy += p.energy;
        c.eCount++;
      }
      if (p.date && !isNaN(p.date)) {
        c.dateSum += p.date;
        c.dateCount++;
      }
      c.count++;
    });
    const out = [];
    cells.forEach((c) => {
      out.push({
        lat: c.lat / c.count,
        lon: c.lon / c.count,
        dose: c.dose / c.count,
        cps: c.cps / c.count,
        energy: c.eCount ? c.energy / c.eCount : NaN,
        date: c.dateCount ? c.dateSum / c.dateCount : NaN,
      });
    });
    return out;
  };

  const updateTrackColors = () => {
    Object.values(tracks).forEach((t) => {
      const color = trackColorForHue(t.hue);
      t.line.setStyle({ color });
      if (t.swatch) t.swatch.style.background = color;
    });
  };

  const renderTrackDots = () => {
    trackDotLayer.clearLayers();
    if (!(trackView && showTrackDots)) return;

    const metric = document.getElementById("metricSelect").value;
    const visibleTracks = Object.values(tracks).filter((t) => t.visible);
    const visiblePoints = visibleTracks.flatMap((t) => filterByDate(t.points));
    if (!visiblePoints.length) return;
    const vals = visiblePoints
      .filter((p) => p.dose !== 0 || p.cps !== 0)
      .map((p) => (metric === "dose" ? p.dose : p.cps));
    const min = Math.min(...vals);
    const max = Math.max(...vals);

    trackDotLayer.addTo(map);
    visibleTracks.forEach((t) => {
      if (!t.markerGroup) t.markerGroup = L.layerGroup();
      else t.markerGroup.clearLayers();

      filterByDate(t.points).forEach((p) => {
        const valMetric = metric === "dose" ? p.dose : p.cps;
        const color =
          p.dose === 0 && p.cps === 0
            ? "#777"
            : colorScale(valMetric, min, max);
        const m = L.circleMarker([p.lat, p.lon], {
          radius: 3,
          color,
          fillColor: color,
          weight: 1,
          opacity: dotOpacity,
          fillOpacity: dotOpacity,
          className: "track-marker",
        });
        t.markerGroup.addLayer(m);
      });
      trackDotLayer.addLayer(t.markerGroup);
    });
  };

  const updateLineStyles = () => {
    Object.values(tracks).forEach((t) => {
      t.line.setStyle({
        weight: lineWidth,
        dashArray: lineDash,
        opacity: lineOpacity,
      });
      if (t.markerGroup) {
        t.markerGroup.eachLayer((m) =>
          m.setStyle({ opacity: dotOpacity, fillOpacity: dotOpacity })
        );
      }
    });
    styleElem.textContent = `.track-line, .data-dot { filter: drop-shadow(0 0 ${lineShadow}px #000); }`;
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
        const hue = nextTrackHue();
        const color = trackColorForHue(hue);
        const line = L.polyline(path, {
          color,
          weight: lineWidth,
          dashArray: lineDash,
          opacity: 0.7,
          className: "track-line",
        });
        const li = document.createElement("li");
        const label = document.createElement("label");
        label.className = "flex items-center gap-2 text-gray-200";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "trackCheck accent-blue-500";
        checkbox.dataset.file = fname;
        checkbox.checked = true;
        const swatch = document.createElement("span");
        swatch.className = "inline-block w-3 h-3 rounded-full";
        swatch.style.background = color;
        label.appendChild(checkbox);
        label.appendChild(swatch);
        label.appendChild(document.createTextNode(" " + fname.split("/").pop()));
        li.appendChild(label);
        trackListElem.appendChild(li);

        tracks[fname] = {
          points: pts,
          line,
          visible: true,
          hue,
          swatch,
          markerGroup: null,
        };




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
              <div class='glass-panel p-2 rounded-lg'>
                <div class='text-gray-400'>Dose min</div>
                <div id='stat-min-dose-${uid}' class='text-lg font-semibold text-sky-400'>0</div>
                <div class='text-gray-400'>µSv/h</div>
              </div>
              <div class='glass-panel p-2 rounded-lg'>
                <div class='text-gray-400'>Dose avg</div>
                <div id='stat-avg-dose-${uid}' class='text-lg font-semibold text-sky-400'>0</div>
                <div class='text-gray-400'>µSv/h</div>
              </div>
              <div class='glass-panel p-2 rounded-lg'>
                <div class='text-gray-400'>Dose max</div>
                <div id='stat-max-dose-${uid}' class='text-lg font-semibold text-sky-400'>0</div>
                <div class='text-gray-400'>µSv/h</div>
              </div>
              <div class='glass-panel p-2 rounded-lg'>
                <div class='text-gray-400'>CPS min</div>
                <div id='stat-min-cps-${uid}' class='text-lg font-semibold text-amber-400'>0</div>
                <div class='text-gray-400'>cps</div>
              </div>
              <div class='glass-panel p-2 rounded-lg'>
                <div class='text-gray-400'>CPS avg</div>
                <div id='stat-avg-cps-${uid}' class='text-lg font-semibold text-amber-400'>0</div>
                <div class='text-gray-400'>cps</div>
              </div>
              <div class='glass-panel p-2 rounded-lg'>
                <div class='text-gray-400'>CPS max</div>
                <div id='stat-max-cps-${uid}' class='text-lg font-semibold text-amber-400'>0</div>
                <div class='text-gray-400'>cps</div>
              </div>
            </div>
            <div class='grid md:grid-cols-2 md:grid-rows-2 gap-4 text-white'>
              <div class='glass-panel p-4 rounded-lg'>
                <label class='block text-xs mb-1'>CPS Avg window: <span id='valCps-${uid}'>1</span></label>
                <input type='range' min='1' max='50' value='1' id='${sliderCpsId}' class='w-full mb-2 accent-teal-500'>
                <div id='${plotCpsId}' class='w-full h-96'></div>
              </div>
              <div class='glass-panel p-4 rounded-lg'>
                <h4 class='text-sm font-semibold mb-2'>CPS histogram</h4>
                <div id='${histCpsId}' class='w-full h-96'></div>
              </div>
              <div class='glass-panel p-4 rounded-lg'>
                <label class='block text-xs mb-1'>Dose Avg window: <span id='valDose-${uid}'>1</span></label>
                <input type='range' min='1' max='50' value='1' id='${sliderDoseId}' class='w-full mb-2 accent-teal-500'>
                <div id='${plotDoseId}' class='w-full h-96'></div>
              </div>
              <div class='glass-panel p-4 rounded-lg'>
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
            const x = filtered.map((p) => new Date(p.date * 1000));
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
              Plotly.newPlot(
                plotCpsDiv,
                [
                  {
                    x,
                    y: vals,
                    name: "CPS",
                    type: "scattergl",
                    mode: "lines",
                    line: {
                      width: 2,
                      color,
                    },
                  },
                ],
                {
                  margin: { l: 40, r: 40, t: 10, b: 30 },
                  paper_bgcolor: "#1f2937",
                  plot_bgcolor: "#1f2937",
                  font: { color: "#ffffff", size: 10 },
                  xaxis: {
                    title: "time",
                    type: "date",
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
              Plotly.newPlot(
                plotDoseDiv,
                [
                  {
                    x,
                    y: vals,
                    name: "Dose (µSv/h)",
                    type: "scattergl",
                    mode: "lines",
                    line: {
                      width: 2,
                      color,
                    },
                  },
                ],
                {
                  margin: { l: 40, r: 40, t: 10, b: 30 },
                  paper_bgcolor: "#1f2937",
                  plot_bgcolor: "#1f2937",
                  font: { color: "#ffffff", size: 10 },
                  xaxis: {
                    title: "time",
                    type: "date",
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
    const points = aggregatePoints(visiblePoints);
    const filteredVals = points.filter(
      (p) => p.dose !== 0 || p.cps !== 0
    );
    const sample = filteredVals.length ? filteredVals : points;
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
    const radius = 4 + map.getZoom() / 2;
    points.forEach((p) => {
      const valMetric = metric === "dose" ? p.dose : p.cps;
      const color = p.dose === 0 && p.cps === 0 ? "#777" : colorScale(valMetric, min, max);
      const marker = L.circleMarker([p.lat, p.lon], {
        radius,
        renderer: map.getRenderer(map),
        fillColor: color,
        color: color,
        fillOpacity: 0.5,
        weight: 0,
        className: "data-dot glass-dot",
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
        `<div class='glass-panel p-2 rounded-lg'>` +
        `<div class='text-gray-400'>Dose</div>` +
        `<div class='text-lg font-semibold text-sky-400'>${p.dose.toFixed(3)}</div>` +
        `<div class='text-gray-400'>µSv/h</div>` +
        `</div>` +
        `<div class='glass-panel p-2 rounded-lg'>` +
        `<div class='text-gray-400'>CPS</div>` +
        `<div class='text-lg font-semibold text-amber-400'>${p.cps.toFixed(1)}</div>` +
        `<div class='text-gray-400'>cps</div>` +
        `</div>`;
      if (hasEnergy) {
        popupHtml +=
          `<div class='glass-panel p-2 rounded-lg'>` +
          `<div class='text-gray-400'>Energy</div>` +
          `<div class='text-lg font-semibold text-purple-400'>${p.energy.toFixed(1)}</div>` +
          `<div class='text-gray-400'>keV</div>` +
          `</div>`;
      }
      popupHtml += `</div>`;
      popupHtml += `<div class='mt-2 text-xs text-gray-400 text-center'>${dateStr}</div>`;
      popupHtml += `</div>`;
      marker.bindPopup(popupHtml);
      marker.on("mouseover", () => marker.openPopup());
      marker.on("mouseout", () => marker.closePopup());
    });
  }

  document
    .getElementById("metricSelect")
    .addEventListener("change", () => {
      drawDots();
      renderTrackDots();
    });
  trackListElem.addEventListener("change", (e) => {
    if (!e.target.dataset.file) return;
    const t = tracks[e.target.dataset.file];
    t.visible = e.target.checked;
    if (trackView) {
      if (t.visible) {
        lineLayer.addLayer(t.line);
        if (showTrackDots) {
          if (!t.markerGroup) renderTrackDots();
          else trackDotLayer.addLayer(t.markerGroup);
        }
      } else {
        lineLayer.removeLayer(t.line);
        if (t.markerGroup) trackDotLayer.removeLayer(t.markerGroup);
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
      trackDotLayer.clearLayers();
      Object.values(tracks).forEach((t) => {
        if (t.visible) lineLayer.addLayer(t.line);
      });
      updateLineStyles();
      renderTrackDots();
    } else {
      lineLayer.clearLayers();
      trackDotLayer.clearLayers();
      drawDots();
    }

  });
  lineStyleBtn.addEventListener("click", () => {
    lineStylePanel.classList.toggle("hidden");
  });
  lineStyleSelect.addEventListener("change", (e) => {
    const val = e.target.value;
    lineDash = val === "solid" ? null : val === "dashed" ? "6 4" : "2 4";
    updateLineStyles();
  });
  lineWidthInput.addEventListener("change", (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v > 0) {
      lineWidth = v;
      updateLineStyles();
    }
  });
  lineOpacityInput.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) {
      lineOpacity = v;
      updateLineStyles();
    }
  });
  lineShadowSlider.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) {
      lineShadow = v;
      updateLineStyles();
    }
  });
  dotOpacitySlider.addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) {
      dotOpacity = v;
      updateLineStyles();
    }
  });
  showTrackDotsToggle.addEventListener("change", (e) => {
    showTrackDots = e.target.checked;
    renderTrackDots();
  });
});
