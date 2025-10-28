// === Base map ===
const map = L.map('map').setView([-1.5, -78.0], 7);
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' });
const baseMaps = { "OpenStreetMap": osm, "Satélite": satelite };
const overlayMaps = {};
L.control.layers(baseMaps, overlayMaps, { position: 'topright', collapsed:false }).addTo(map);

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
  // cache-busting para evitar que GitHub Pages sirva versión antigua
  const sep = base.includes('?') ? '&' : '?';
  return base + sep + 'v=' + Date.now();
}

// === Load institutions (with optional clustering) ===
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
          radius: 5, fillColor: 'red', color: '#b30000', weight: 1, fillOpacity: .85
        }),
        onEachFeature: (f, layer) => {
          const p = f.properties || {};
          layer.bindPopup(`<b>${p.nombre || 'Sin nombre'}</b><br>AMIE: ${p.amie || '—'}<br>Provincia: ${p.provincia || '—'}<br>Cantón: ${p.canton || '—'}`);
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
    const feat = l.feature || l.getLayers?.()[0]?.feature; // handle clusters
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
