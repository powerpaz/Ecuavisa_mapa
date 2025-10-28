// Inicializa el mapa
const map = L.map("map").setView([-1.8312, -78.1834], 7);

// Capas base: OSM y Satélite
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19,
  attribution: "© Esri, Maxar, Earthstar Geographics"
});

L.control.layers(
  { "OpenStreetMap": osm, "Satélite": satellite }
).addTo(map);

let markersLayer = L.layerGroup().addTo(map);
let dataPoints = [];

// Carga el CSV
Papa.parse("ecuavisa.csv", {
  download: true,
  header: true,
  complete: function(results) {
    dataPoints = results.data.filter(d => d.lat && d.lon);
    renderMarkers(dataPoints);
  }
});

// Función para dibujar los puntos
function renderMarkers(data) {
  markersLayer.clearLayers();

  data.forEach(d => {
    const lat = parseFloat(d.lat);
    const lon = parseFloat(d.lon);
    if (isNaN(lat) || isNaN(lon)) return;

    const marker = L.circleMarker([lat, lon], {
      radius: 6,
      fillColor: "#FF5733",
      color: "#FF5733",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    });

    marker.bindTooltip(d.nombre || "Sin nombre", { permanent: false });
    marker.on("mouseover", function() {
      this.openTooltip();
    });

    markersLayer.addLayer(marker);
  });
}

// Filtrado por AMIE
document.getElementById("applyFilter").addEventListener("click", () => {
  const amieInput = document.getElementById("amieFilter").value.trim().toUpperCase();
  const filtered = dataPoints.filter(d => d.amie?.toUpperCase().includes(amieInput));
  renderMarkers(filtered);
});
