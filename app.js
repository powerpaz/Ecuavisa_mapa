// === Base map ===
const map = L.map('map').setView([-1.5, -78.0], 7);
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' });
const baseMaps = { "OpenStreetMap": osm, "Satélite": satelite };
const overlayMaps = {};
L.control.layers(baseMaps, overlayMaps, { position: 'topright', collapsed:false }).addTo(map);

// === Provincias (delimitadas con highlight) ===
const PROVINCES_ON = true;
let provinciasLayer = null;

function loadProvincias(){
  if (!PROVINCES_ON) return;
  fetch('data/provincias.geojson')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(geo => {
      function styleNormal(){ return { color:'#2b7a78', weight:1.2, fillOpacity:0, dashArray:'3' }; }
      function styleHover(){ return { color:'#0d9488', weight:2, fillOpacity:0 }; }

      provinciasLayer = L.geoJSON(geo, {
        style: styleNormal,
        onEachFeature: (f, layer) => {
          layer.on('mouseover', () => layer.setStyle(styleHover()));
          layer.on('mouseout',  () => layer.setStyle(styleNormal()));
          layer.on('click',    () => map.fitBounds(layer.getBounds().pad(0.15)));
          // popup con nombre si existe
          const name = f.properties?.name || f.properties?.NOMBRE || f.properties?.provincia;
          if (name) layer.bindPopup(`<b>${name}</b>`);
        }
      }).addTo(map);
      overlayMaps['Provincias'] = provinciasLayer;
    })
    .catch(()=>console.warn('provincias.geojson no encontrado: coloca tu archivo en data/provincias.geojson'));
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
  const nombre = pick(row, ['INSTITUCIO','nombre','NOMBRE','institucion','Institución','Institucion']);
  const provincia = pick(row, ['Provincia','provincia','PROVINCIA']);
  const canton = pick(row, ['Cantón','CANTON','canton','CANTÓN']);

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

function buildPopupAllProps(props){
  const entries = Object.entries(props || {})
    .filter(([k,v]) => k !== 'geometry' && typeof v !== 'object')
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
        pointToLayer: (f, latlng) => L.circleMarker(latlng, {
          radius: 6, fillColor: 'red', color: '#b30000', weight: 1, fillOpacity: .9
        }),
        onEachFeature: (f, layer) => {
          layer.bindPopup(buildPopupAllProps(f.properties));
          // Centrar en el punto al hacer click (fijo en su punto)
          layer.on('click', () => {
            map.flyTo(layer.getLatLng(), Math.max(map.getZoom(), 12), { duration: 0.6 });
            layer.openPopup();
          });
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
