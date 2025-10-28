// === Base map ===
const map = L.map('map').setView([-1.5, -78.0], 7);
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' });
const baseMaps = { "OpenStreetMap": osm, "Satélite": satelite };
const overlayMaps = {};
L.control.layers(baseMaps, overlayMaps, { position: 'topright', collapsed:false }).addTo(map);

// === Provincias (delimitadas y simplificadas con turf) ===
const PROVINCES_ON = true;
let provinciasLayer = null;

function loadProvincias(){
  if (!PROVINCES_ON) return;
  fetch('data/provincias.geojson')
    .then(r => r.ok ? r.json() : Promise.reject('not found'))
    .then(geo => {
      // Simplificar (tolerance en grados, ajustar si hace falta)
      const simplified = turf.simplify(geo, { tolerance: 0.01, highQuality: false });
      function styleNormal(){ return { color:'#1f6f78', weight:1.5, fillOpacity:0, dashArray:'3' }; }
      function styleHover(){ return { color:'#0ea5e9', weight:2.5, fillOpacity:0 }; }

      provinciasLayer = L.geoJSON(simplified, {
        style: styleNormal,
        onEachFeature: (f, layer) => {
          layer.on('mouseover', () => layer.setStyle(styleHover()));
          layer.on('mouseout',  () => layer.setStyle(styleNormal()));
          layer.on('click',    () => map.fitBounds(layer.getBounds().pad(0.12)));
          const name = f.properties?.name || f.properties?.NOMBRE || f.properties?.provincia || 'Provincia';
          layer.bindPopup(`<b>${name}</b>`);
        }
      }).addTo(map);
      overlayMaps['Provincias'] = provinciasLayer;
    })
    .catch(()=>console.warn('data/provincias.geojson no encontrado. Colócalo para ver las provincias.'));
}
loadProvincias();

// === Helpers ===
function toNumber(x){
  if (x === null || x === undefined) return NaN;
  if (typeof x === 'number') return x;
  const s = String(x).trim().replace(',', '.'); // coma -> punto
  const v = parseFloat(s);
  return isNaN(v) ? NaN : v;
}
function pick(obj, keys){
  for (const k of keys){
    if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') return obj[k];
  }
  return undefined;
}
const proj32717 = "+proj=utm +zone=17 +south +datum=WGS84 +units=m +no_defs";
const proj32718 = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";
function utmToLonLat(x, y, zone=17){
  const src = zone===18 ? proj32718 : proj32717;
  const out = proj4(src, proj4.WGS84, [x, y]);
  return {lon: out[0], lat: out[1]};
}
function getCSVPath(){
  const params = new URLSearchParams(window.location.search);
  const base = params.get('csv') || 'data/instituciones.csv';
  const sep = base.includes('?') ? '&' : '?';
  return base + sep + 'v=' + Date.now();
}

// === Load institutions (cluster opcional) ===
let institucionesLayer = null;
const USE_CLUSTER = true;
let clusterGroup = USE_CLUSTER ? L.markerClusterGroup() : null;

function filaToFeature(row){
  const amie = pick(row, ['AMIE','amie','codigo','CODIGO','Código']);
  const nombre = pick(row, ['INSTITUCION','INSTITUCIO','nombre','NOMBRE','institucion','Institución','Institucion']);
  const provincia = pick(row, ['Provincia','PROVINCIA','provincia']);
  const canton = pick(row, ['Cantón','CANTON','CANTÓN','canton']);

  let lat = toNumber(pick(row, ['Latitud','lat','Lat','LAT']));
  let lon = toNumber(pick(row, ['Longitud','lon','Lon','LON']));

  if (isNaN(lat) || isNaN(lon)){
    const x = toNumber(pick(row, ['COORDENADA X','COORDENADAX','X','coord_x','COORD_X']));
    const y = toNumber(pick(row, ['COORDENADA Y','COORDENADAY','Y','coord_y','COORD_Y']));
    let zone = 17;
    const zoneHint = pick(row, ['ZONA','zona','zone']);
    if (zoneHint && String(zoneHint).includes('18')) zone = 18;
    if (!isNaN(x) && !isNaN(y)){
      const ll = utmToLonLat(x, y, zone);
      lon = ll.lon; lat = ll.lat;
    }
  }

  if (isNaN(lat) || isNaN(lon)) return null;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: { ...row, amie, nombre, provincia, canton, lat, lon }
  };
}

const HIDE_KEYS = new Set(['Latitud','Longitud','lat','lon','X','Y','COORDENADA X','COORDENADAX','COORDENADA Y','COORDENADAY']);

function buildPopupTable(props){
  const entries = Object.entries(props || {})
    .filter(([k,v]) => !HIDE_KEYS.has(k) && typeof v !== 'object')
    .sort((a,b) => a[0].localeCompare(b[0]));
  const rows = entries.map(([k,v]) => `<tr><td class="key">${k}</td><td>${v ?? ''}</td></tr>`).join('');
  return `<table class="popup-table">${rows}</table>`;
}

function cargarInstituciones(){
  const csvPath = getCSVPath();
  Papa.parse(csvPath, {
    download: true,
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
    complete: (res) => {
      let total = 0, ok = 0, bad = 0;
      const feats = [];
      for (const row of res.data){
        total++;
        const f = filaToFeature(row);
        if (f){ feats.push(f); ok++; } else { bad++; }
      }

      if (institucionesLayer) { map.removeLayer(institucionesLayer); }
      if (clusterGroup) { map.removeLayer(clusterGroup); clusterGroup = L.markerClusterGroup(); }

      institucionesLayer = L.geoJSON(feats, {
        pointToLayer: (f, latlng) => {
          const marker = L.circleMarker(latlng, {
            radius: 7, fillColor: '#e11d48', color: '#ffffff', weight: 2, fillOpacity: .95
          });
          marker.on('mouseover', () => marker.setStyle({ radius: 9 }));
          marker.on('mouseout',  () => marker.setStyle({ radius: 7 }));
          // centrar al click y abrir popup
          marker.on('click', () => {
            map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 12), { duration: 0.6 });
            marker.openPopup();
          });
          return marker;
        },
        onEachFeature: (f, layer) => {
          layer.bindPopup(buildPopupTable(f.properties));
        }
      });

      if (clusterGroup){
        clusterGroup.addLayer(institucionesLayer).addTo(map);
        overlayMaps['Instituciones'] = clusterGroup;
      } else {
        institucionesLayer.addTo(map);
        overlayMaps['Instituciones'] = institucionesLayer;
      }

      document.getElementById('counter').textContent = `Registros: ${ok} / ${total}`;
      if (ok>0){
        const bounds = clusterGroup ? clusterGroup.getBounds() : institucionesLayer.getBounds();
        map.fitBounds(bounds.pad(0.2));
      }
      console.log(`CSV procesado. Total: ${total} | geocodificadas: ${ok} | omitidas: ${bad}`);
    },
    error: (err) => alert('No se pudo leer el CSV: ' + err)
  });
}
cargarInstituciones();

// === Filter by AMIE ===
function getActiveLayer(){
  return clusterGroup || institucionesLayer;
}
document.getElementById('filterBtn').addEventListener('click', () => {
  const active = getActiveLayer(); if (!active) return;
  const term = (document.getElementById('amieFilter').value || '').toLowerCase().trim();
  if (!term) return;
  const matched = [];
  active.eachLayer(l => {
    const feat = l.feature || l.getLayers?.()[0]?.feature; // clusters
    const a = (feat?.properties?.amie || '').toString().toLowerCase();
    if (a.includes(term)) matched.push(l);
  });
  if (matched.length){
    const g = L.featureGroup(matched.map(x => x.getBounds ? x : L.featureGroup([x])));
    map.fitBounds(g.getBounds().pad(0.2));
    if (matched[0].openPopup) matched[0].openPopup();
  } else {
    alert('No se encontraron coincidencias');
  }
});
document.getElementById('clearBtn').addEventListener('click', () => {
  document.getElementById('amieFilter').value = '';
  const active = getActiveLayer();
  if (active) map.fitBounds(active.getBounds().pad(0.2));
  else map.setView([-1.5, -78.0], 7);
});
