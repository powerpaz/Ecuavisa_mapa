// Inicializar mapa
const map = L.map('map').setView([-1.5, -78.0], 7);

// Capas base
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(map);

const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: '© Esri Satellite'
});

const baseMaps = {
  "OpenStreetMap": osm,
  "Satélite": satelite
};

const overlayMaps = {};

L.control.layers(baseMaps, overlayMaps, { position: 'topright', collapsed: false }).addTo(map);

// Provincias (si no existe el archivo, no rompe)
fetch('data/provincias.geojson')
  .then(r => r.ok ? r.json() : Promise.reject('no-prov'))
  .then(geo => {
    const prov = L.geoJSON(geo, { style: { color: '#000', weight: 1, fillOpacity: 0 } }).addTo(map);
    overlayMaps["Provincias"] = prov;
  }).catch(() => console.warn('Provincias: usando placeholder o pendiente de reemplazo'));

// Capa de instituciones
let institucionesLayer;

function cargarInstituciones() {
  Papa.parse('data/instituciones.csv', {
    download: true,
    header: true,
    dynamicTyping: true,
    complete: (res) => {
      const rows = res.data.filter(r => r && r.lat && r.lon && !isNaN(r.lat) && !isNaN(r.lon));
      const features = rows.map(r => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [parseFloat(r.lon), parseFloat(r.lat)] },
        properties: r
      }));

      if (institucionesLayer) { map.removeLayer(institucionesLayer); }

      institucionesLayer = L.geoJSON(features, {
        pointToLayer: (f, latlng) => L.circleMarker(latlng, {
          radius: 5, fillColor: "red", color: "#b30000", weight: 1, fillOpacity: 0.85
        }),
        onEachFeature: (f, layer) => {
          const p = f.properties || {};
          const nombre = p.nombre || p.NOMBRE || "Sin nombre";
          const amie = p.amie || p.AMIE || "—";
          const provincia = p.provincia || p.PROVINCIA || "—";
          const canton = p.canton || p.CANTON || "—";
          layer.bindPopup(`<b>${nombre}</b><br>AMIE: ${amie}<br>Provincia: ${provincia}<br>Cantón: ${canton}`);
        }
      }).addTo(map);

      overlayMaps["Instituciones"] = institucionesLayer;
    }
  });
}
cargarInstituciones();

// Filtro por AMIE
document.getElementById('filterBtn').addEventListener('click', () => {
  const term = (document.getElementById('amieFilter').value || '').toString().trim().toLowerCase();
  if (!term || !institucionesLayer) return;

  const matched = [];
  institucionesLayer.eachLayer(l => {
    const p = l.feature?.properties || {};
    const amie = (p.amie || p.AMIE || '').toString().toLowerCase();
    if (amie.includes(term)) matched.push(l);
  });

  if (matched.length) {
    const g = L.featureGroup(matched);
    map.fitBounds(g.getBounds().pad(0.2));
    matched[0].openPopup();
  } else {
    alert('No se encontraron coincidencias para ese AMIE');
  }
});

document.getElementById('clearBtn').addEventListener('click', () => {
  document.getElementById('amieFilter').value = '';
  map.setView([-1.5, -78.0], 7);
});
