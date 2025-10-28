// Utilidades -----------------------------------------------------------
function toNumber(x){
  if (x === null || x === undefined) return NaN;
  if (typeof x === 'number') return x;
  // Reemplazar coma decimal por punto
  const s = String(x).trim().replace(',', '.');
  const v = parseFloat(s);
  return isNaN(v) ? NaN : v;
}

function pick(obj, keys){
  for (const k of keys){
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  }
  return undefined;
}

// Proyección UTM 17S y 18S (EPSG:32717 y EPSG:32718)
const proj32717 = "+proj=utm +zone=17 +south +datum=WGS84 +units=m +no_defs";
const proj32718 = "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs";

function utmToLonLat(x, y, zone=17){
  const src = zone===18 ? proj32718 : proj32717;
  const [lon, lat] = proj4(src, proj4.WGS84, [x, y]);
  return {lon, lat};
}

// Permitir ?csv=archivo.csv
function getCSVPath(){
  const params = new URLSearchParams(window.location.search);
  return params.get('csv') || 'data/instituciones.csv';
}

// Crear mapa -----------------------------------------------------------
const map = L.map('map').setView([-1.5, -78.0], 7);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' });

const baseMaps = { "OpenStreetMap": osm, "Satélite": satelite };
const overlayMaps = {};
L.control.layers(baseMaps, overlayMaps, { position: 'topright', collapsed:false }).addTo(map);

// Provincias (placeholder seguro)
fetch('data/provincias.geojson').then(r => r.ok ? r.json() : Promise.reject()).then(geo => {
  const prov = L.geoJSON(geo, { style:{ color:'#000', weight:1, fillOpacity:0 } }).addTo(map);
  overlayMaps['Provincias'] = prov;
}).catch(()=>console.warn('provincias.geojson no encontrado'));

// Cargar CSV flexible --------------------------------------------------
let institucionesLayer;

function filaToFeature(row){
  // Posibles columnas
  const amie = pick(row, ['amie','AMIE','codigo','Codigo','Código','CODIGO']);
  const nombre = pick(row, ['nombre','NOMBRE','institucion','Institución','Institucion']);
  const provincia = pick(row, ['provincia','PROVINCIA']);
  const canton = pick(row, ['canton','CANTON','cantón','CANTÓN']);

  // 1) Intentar WGS84
  let lat = toNumber(pick(row, ['lat','Lat','LAT','latitud','Latitud','LATITUD']));
  let lon = toNumber(pick(row, ['lon','Lon','LON','longitud','Longitud','LONGITUD']));

  // 2) Si no hay WGS84, intentar UTM X/Y
  if (isNaN(lat) || isNaN(lon)){
    const x = toNumber(pick(row, ['COORDENADA X','X','coord_x','COORD_X','COORDENADA_X']));
    const y = toNumber(pick(row, ['COORDENADA Y','Y','coord_y','COORD_Y','COORDENADA_Y']));
    // Zona (17 por defecto, o deducida por longitud X)
    let zone = 17;
    const zoneHint = pick(row, ['ZONA','zona','zone']);
    if (zoneHint && String(zoneHint).includes('18')) zone = 18;
    if (!isNaN(x) && !isNaN(y)){
      const ll = utmToLonLat(x, y, zone);
      lon = ll.lon;
      lat = ll.lat;
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

      if (institucionesLayer) map.removeLayer(institucionesLayer);

      institucionesLayer = L.geoJSON(feats, {
        pointToLayer: (f, latlng) => L.circleMarker(latlng, {
          radius: 5, fillColor: 'red', color: '#b30000', weight: 1, fillOpacity: .85
        }),
        onEachFeature: (f, layer) => {
          const p = f.properties || {};
          layer.bindPopup(`<b>${p.nombre || 'Sin nombre'}</b><br>AMIE: ${p.amie || '—'}<br>Provincia: ${p.provincia || '—'}<br>Cantón: ${p.canton || '—'}`);
        }
      }).addTo(map);

      overlayMaps['Instituciones'] = institucionesLayer;

      if (ok>0){
        map.fitBounds(institucionesLayer.getBounds().pad(0.2));
      }
      console.log(`CSV procesado. Total filas: ${total}, geocodificadas: ${ok}, omitidas: ${bad}`);
    },
    error: (err) => { alert('No se pudo leer el CSV: ' + err); }
  });
}
cargarInstituciones();

// Filtro por AMIE
document.getElementById('filterBtn').addEventListener('click', () => {
  if (!institucionesLayer) return;
  const term = (document.getElementById('amieFilter').value || '').toLowerCase().trim();
  if (!term) return;

  const matched = [];
  institucionesLayer.eachLayer(l => {
    const a = (l.feature?.properties?.amie || '').toString().toLowerCase();
    if (a.includes(term)) matched.push(l);
  });
  if (matched.length){
    const g = L.featureGroup(matched);
    map.fitBounds(g.getBounds().pad(0.2));
    matched[0].openPopup();
  } else {
    alert('No se encontraron coincidencias');
  }
});

document.getElementById('clearBtn').addEventListener('click', () => {
  document.getElementById('amieFilter').value = '';
  if (institucionesLayer) map.fitBounds(institucionesLayer.getBounds().pad(0.2));
  else map.setView([-1.5, -78.0], 7);
});
