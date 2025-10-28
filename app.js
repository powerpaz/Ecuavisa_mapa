// === Mapa base ===
const map = L.map('map').setView([-1.5, -78.0], 7);
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' });
const baseMaps = { "OpenStreetMap": osm, "Satélite": satelite };
const overlayMaps = {};
L.control.layers(baseMaps, overlayMaps, { position: 'topright', collapsed:false }).addTo(map);

// === Provincias ===
fetch('data/provincias.geojson')
  .then(r => r.json())
  .then(geo => {
    const simplified = turf.simplify(geo, { tolerance: 0.01, highQuality: false });
    const styleNormal = { color:'#1f6f78', weight:1.5, fillOpacity:0, dashArray:'3' };
    const styleHover  = { color:'#0ea5e9', weight:2.5, fillOpacity:0 };
    const provincias = L.geoJSON(simplified, {
      style: styleNormal,
      onEachFeature: (f, layer) => {
        layer.on('mouseover', () => layer.setStyle(styleHover));
        layer.on('mouseout', () => layer.setStyle(styleNormal));
        layer.on('click', () => map.fitBounds(layer.getBounds().pad(0.15)));
        const name = f.properties?.name || f.properties?.NOMBRE || f.properties?.provincia;
        if (name) layer.bindPopup(`<b>${name}</b>`);
      }
    }).addTo(map);
    overlayMaps['Provincias'] = provincias;
  });

// === Utilidades ===
function toNumber(x){
  if (x === null || x === undefined) return NaN;
  if (typeof x === 'number') return x;
  const s = String(x).trim().replace(',', '.');
  return parseFloat(s);
}

function buildPopup(props){
  const entries = Object.entries(props)
    .filter(([k]) => !['lat','lon','Latitud','Longitud','amie'].includes(k))
    .map(([k,v]) => `<tr><td class="key">${k}</td><td>${v ?? ''}</td></tr>`).join('');
  return `<table class="popup-table">${entries}</table>`;
}

// === Cargar instituciones ===
function cargarInstituciones(){
  Papa.parse('data/instituciones.csv', {
    download: true,
    header: true,
    complete: (res) => {
      const feats = [];
      res.data.forEach(r => {
        const lat = toNumber(r.Latitud);
        const lon = toNumber(r.Longitud);
        if (!isNaN(lat) && !isNaN(lon)){
          feats.push({ type:'Feature', geometry:{type:'Point', coordinates:[lon,lat]}, properties:r });
        }
      });
      const layer = L.geoJSON(feats, {
        pointToLayer:(f,latlng)=>{
          const m=L.circleMarker(latlng,{radius:7,fillColor:'#e11d48',color:'#fff',weight:2,fillOpacity:.95});
          m.on('mouseover',()=>m.setStyle({radius:9}));
          m.on('mouseout',()=>m.setStyle({radius:7}));
          m.on('click',()=>{map.flyTo(m.getLatLng(),12,{duration:.6});m.openPopup();});
          return m;
        },
        onEachFeature:(f,l)=>l.bindPopup(buildPopup(f.properties))
      }).addTo(map);
      overlayMaps['Instituciones']=layer;
      map.fitBounds(layer.getBounds().pad(0.2));
      document.getElementById('counter').textContent=`Registros: ${feats.length}`;
    }
  });
}
cargarInstituciones();

// === Filtro ===
document.getElementById('filterBtn').addEventListener('click',()=>{
  const val=document.getElementById('amieFilter').value.trim().toLowerCase();
  if(!val)return;
  let found=null;
  Object.values(overlayMaps).forEach(l=>{
    if(l.eachLayer)l.eachLayer(layer=>{
      const p=layer.feature?.properties;
      if(p&&String(p.AMIE).toLowerCase().includes(val))found=layer;
    });
  });
  if(found){map.flyTo(found.getLatLng(),12,{duration:.6});found.openPopup();}
  else alert('No se encontró el AMIE');
});
document.getElementById('clearBtn').addEventListener('click',()=>{
  document.getElementById('amieFilter').value='';
  map.setView([-1.5,-78.0],7);
});
