// ========= Config =========
const CSV_PATH = "ecuavisa.csv";                      // Pon aquí tu CSV
const PROVINCES_GEOJSON = "provincias_simplificado.geojson"; // GeoJSON de provincias

// ========= Mapa base =========
const map = L.map("map", { zoomControl: true }).setView([-1.8312, -78.1834], 6); // Ecuador

const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19,
  attribution: "© Esri, Maxar, Earthstar Geographics"
});

const baseMaps = { "OpenStreetMap": osm, "Satélite": satellite };

// Provincias (polígono)
const provincesLayer = L.geoJSON(null, {
  style: () => ({
    color: "#555",
    weight: 1,
    fillColor: "#cccccc",
    fillOpacity: 0.15
  }),
  onEachFeature: (feature, layer) => {
    const props = feature.properties || {};
    const rows = Object.entries(props)
      .map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("");
    const html = `<div class="popup"><h3>Provincia</h3><table class="attr-table">${rows}</table></div>`;
    layer.bindPopup(html);
  }
});

const institutionsLayer = L.layerGroup();

L.control.layers(baseMaps, { "Provincias": provincesLayer, "Instituciones": institutionsLayer }, { collapsed: false }).addTo(map);

// ========= Utilidades =========
function normalizeHeaders(header) {
  const h = header.toLowerCase().trim();
  if (["amie", "codigo amie", "cod_amie", "codigo"].includes(h)) return "amie";
  if (["nombre", "institucion", "institución", "name"].includes(h)) return "nombre";
  if (["lat", "latitude", "latitud", "coord_y", "y"].includes(h)) return "lat";
  if (["lon", "long", "lng", "longitud", "coord_x", "x"].includes(h)) return "lon";
  return header;
}

function buildPopupFromObject(obj, title = "Detalle") {
  const rows = Object.entries(obj)
    .map(([k, v]) => `<tr><th>${k}</th><td>${v ?? ""}</td></tr>`).join("");
  return `<div class="popup"><h3>${title}</h3><table class="attr-table">${rows}</table></div>`;
}

// ========= Cargar Provincias =========
fetch(PROVINCES_GEOJSON)
  .then(r => r.json())
  .then(geo => {
    provincesLayer.addData(geo);
    provincesLayer.addTo(map);
  })
  .catch(err => console.error("No se pudo cargar provincias:", err));

// ========= Cargar CSV de instituciones =========
let allInstitutions = [];
let currentMarkers = [];

Papa.parse(CSV_PATH, {
  download: true,
  header: true,
  skipEmptyLines: true,
  complete: function (results) {
    if (!results || !results.data) { console.error("CSV vacío o ilegible"); return; }

    // Normaliza nombres de columnas y conserva el resto como atributos
    const normalized = results.data.map(row => {
      const obj = {};
      Object.keys(row).forEach(k => { obj[normalizeHeaders(k)] = row[k]; });
      return obj;
    });

    allInstitutions = normalized.filter(d => d.lat && d.lon);
    renderInstitutions(allInstitutions);
    fitToMarkers();
  },
  error: function (err) { console.error("Error CSV:", err); }
});

function renderInstitutions(data) {
  institutionsLayer.clearLayers();
  currentMarkers = [];

  data.forEach(d => {
    const lat = parseFloat((d.lat || "").toString().replace(",", "."));
    const lon = parseFloat((d.lon || "").toString().replace(",", "."));
    if (isNaN(lat) || isNaN(lon)) return;

    const marker = L.circleMarker([lat, lon], {
      radius: 5.5,
      fillColor: "#E74C3C",
      color: "#B03A2E",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.85
    });

    const label = d.nombre || d.name || d.amie || "Institución";
    marker.bindTooltip(label, { direction: "top", offset: [0, -4] });
    marker.bindPopup(buildPopupFromObject(d, "Institución"));

    marker.addTo(institutionsLayer);
    currentMarkers.push(marker);
  });
}

function fitToMarkers() {
  if (currentMarkers.length > 0) {
    const group = L.featureGroup(currentMarkers);
    map.fitBounds(group.getBounds().pad(0.2));
  } else {
    map.setView([-1.8312, -78.1834], 6);
  }
}

// ========= Filtro por AMIE =========
const amieInput = document.getElementById("amieInput");
document.getElementById("btnFilter").addEventListener("click", () => {
  const q = (amieInput.value || "").trim().toUpperCase();
  if (!q) { renderInstitutions(allInstitutions); fitToMarkers(); return; }
  const filtered = allInstitutions.filter(d => (d.amie || "").toString().toUpperCase().includes(q));
  renderInstitutions(filtered);
  fitToMarkers();
});
document.getElementById("btnClear").addEventListener("click", () => {
  amieInput.value = "";
  renderInstitutions(allInstitutions);
  fitToMarkers();
});
