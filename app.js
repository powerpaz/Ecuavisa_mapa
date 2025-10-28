// Crear mapa
const map = L.map('map').setView([-1.5, -78.0], 7);

// Capas base
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(map);

const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: '© Esri Satellite'
});

// Control de capas
const baseMaps = {
  "OpenStreetMap": osm,
  "Satélite": satelite
};
const overlayMaps = {};
L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(map);

// Cargar provincias
fetch('data/provincias.geojson')
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      style: { color: "#000", weight: 1, fillOpacity: 0 }
    }).addTo(map);
  });

// Cargar CSV de instituciones
let institucionesLayer;
function cargarInstituciones() {
  Papa.parse('data/instituciones.csv', {
    download: true,
    header: true,
    complete: (results) => {
      const puntos = results.data.map(row => {
        if (row.lat && row.lon) {
          return {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [parseFloat(row.lon), parseFloat(row.lat)]
            },
            properties: row
          };
        }
      }).filter(Boolean);

      institucionesLayer = L.geoJSON(puntos, {
        pointToLayer: (f, latlng) => L.circleMarker(latlng, {
          radius: 5,
          fillColor: "red",
          color: "#b30000",
          weight: 1,
          fillOpacity: 0.8
        }),
        onEachFeature: (feature, layer) => {
          const props = feature.properties;
          layer.bindPopup(`
            <b>${props.nombre || 'Sin nombre'}</b><br>
            AMIE: ${props.amie}<br>
            Provincia: ${props.provincia}<br>
            Cantón: ${props.canton}
          `);
        }
      }).addTo(map);
      overlayMaps["Instituciones"] = institucionesLayer;
    }
  });
}
cargarInstituciones();

// Filtro por AMIE
document.getElementById('filterBtn').addEventListener('click', () => {
  const term = document.getElementById('amieFilter').value.toLowerCase();
  if (!term) return;

  const filtered = [];
  institucionesLayer.eachLayer(layer => {
    if (layer.feature.properties.amie.toLowerCase().includes(term)) {
      filtered.push(layer);
    }
  });

  if (filtered.length) {
    const group = L.featureGroup(filtered);
    map.fitBounds(group.getBounds());
  }
});

document.getElementById('clearBtn').addEventListener('click', () => {
  document.getElementById('amieFilter').value = '';
  map.setView([-1.5, -78.0], 7);
});
