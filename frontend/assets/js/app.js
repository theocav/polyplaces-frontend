const obs = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        obs.unobserve(e.target);
      }
    });
  },
  { threshold: 0.1 }
);

document.querySelectorAll('.reveal').forEach((el) => obs.observe(el));

const prices = { '500': 89, '1000': 129, '2000': 179, a4: 129 };
const scaleNames = {
  '500': 'Neighbourhood \u00B7 500m\u00D7500m',
  '1000': 'District \u00B7 1km\u00D71km',
  '2000': 'Quarter \u00B7 2km\u00D72km',
  a4: 'Portrait \u00B7 1km\u00D7A4',
};

let storeInited = false;

function showStore() {
  document.getElementById('landing').style.display = 'none';
  document.getElementById('storePage').style.display = 'block';
  window.scrollTo(0, 0);
  if (!storeInited) {
    initMap();
    storeInited = true;
  }
}

function showLanding() {
  document.getElementById('storePage').style.display = 'none';
  document.getElementById('landing').style.display = 'block';
  window.scrollTo(0, 0);
}

let map, layerGroup, bbox, bboxLayer, handle, selectedSize;

function initMap() {
  map = L.map('store-map', { zoomControl: true }).setView([51.505, -0.09], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '\u00A9 OpenStreetMap',
  }).addTo(map);
  layerGroup = L.layerGroup().addTo(map);

  const hIcon = L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:white;border:2.5px solid #c94f2c;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,0.2);cursor:grab"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#c94f2c" stroke-width="2.5"><path d="M12 2v20M2 12h20"/></svg></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

  document.querySelectorAll('.size-opt').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.size-opt').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSize = btn.dataset.size;
      layerGroup.clearLayers();
      createBBox(map.getCenter(), hIcon);
      document.getElementById('sel-run').disabled = false;
      document.getElementById('map-hint').textContent = 'Drag the corner handle to reposition';
      document.getElementById('order-scale').textContent = scaleNames[selectedSize];
      document.getElementById('order-price').textContent = `\u00A3${prices[selectedSize]}`;
      document.getElementById('order-status-msg').textContent = 'Looking good! Adjust the frame then continue.';
      document.getElementById('order-location').textContent = 'London, UK (adjust on map)';
      document.getElementById('order-location').classList.remove('pending');
    };
  });

  document.getElementById('sel-run').onclick = () => {
    document.getElementById('order-status-msg').textContent = '\u2713 Area confirmed. Ready to review your order.';
    document.getElementById('sel-run').textContent = '\u2713 Confirmed \u2014 continue';
  };
  document.getElementById('sel-clear').onclick = clearMap;

  selectedSize = '500';
  createBBox(map.getCenter(), hIcon);
  document.getElementById('sel-run').disabled = false;
  document.getElementById('map-hint').textContent = 'Drag the corner handle to reposition';
  document.getElementById('order-scale').textContent = scaleNames['500'];
  document.getElementById('order-price').textContent = '\u00A389';
  document.getElementById('order-location').textContent = 'London, UK (adjust on map)';
  document.getElementById('order-location').classList.remove('pending');
  document.getElementById('order-status-msg').textContent = 'Frame placed! Drag to your chosen location.';
}

function mToLat(m) {
  return m / 111320;
}

function mToLon(m, lat) {
  return m / (111320 * Math.cos((lat * Math.PI) / 180));
}

function computeBBox(c) {
  let w, h;
  if (selectedSize === 'a4') {
    w = 1000;
    h = 1000 * Math.sqrt(2);
  } else {
    w = h = parseFloat(selectedSize);
  }
  const dLat = mToLat(h / 2);
  const dLon = mToLon(w / 2, c.lat);
  return { south: c.lat - dLat, north: c.lat + dLat, west: c.lng - dLon, east: c.lng + dLon };
}

function createBBox(c, icon) {
  bbox = computeBBox(c);
  drawBBox(icon);
}

function drawBBox(icon) {
  if (!bbox) return;
  const coords = [
    [bbox.south, bbox.west],
    [bbox.south, bbox.east],
    [bbox.north, bbox.east],
    [bbox.north, bbox.west],
  ];
  if (bboxLayer) map.removeLayer(bboxLayer);
  bboxLayer = L.polygon(coords, {
    color: '#c94f2c',
    weight: 2,
    fillColor: '#c94f2c',
    fillOpacity: 0.05,
    dashArray: '6 4',
  }).addTo(map);
  const h = [bbox.north, bbox.west];
  if (!handle) {
    handle = L.marker(h, { draggable: true, icon }).addTo(map);
    handle.on('drag', (e) => {
      layerGroup.clearLayers();
      moveFromHandle(e.target.getLatLng());
    });
  } else {
    handle.setLatLng(h);
  }
}

function moveFromHandle(ll) {
  const w = bbox.east - bbox.west;
  const h = bbox.north - bbox.south;
  bbox = { south: ll.lat - h, north: ll.lat, west: ll.lng, east: ll.lng + w };
  if (bboxLayer) {
    bboxLayer.setLatLngs([
      [bbox.south, bbox.west],
      [bbox.south, bbox.east],
      [bbox.north, bbox.east],
      [bbox.north, bbox.west],
    ]);
  }
  if (handle) handle.setLatLng([bbox.north, bbox.west]);
}

function clearMap() {
  layerGroup.clearLayers();
  if (bboxLayer) {
    map.removeLayer(bboxLayer);
    bboxLayer = null;
  }
  if (handle) {
    map.removeLayer(handle);
    handle = null;
  }
  bbox = null;
  document.getElementById('sel-run').disabled = true;
  document.getElementById('sel-run').textContent = 'Continue to review \u2192';
  document.getElementById('order-scale').textContent = '\u2014';
  document.getElementById('order-price').textContent = '\u2014';
  document.getElementById('order-location').textContent = 'Select on map';
  document.getElementById('order-location').classList.add('pending');
  document.getElementById('order-status-msg').textContent =
    'Choose a scale on the left and drag the frame to your chosen location.';
  document.getElementById('map-hint').textContent = 'Select a scale to place your frame';
  document.querySelectorAll('.size-opt').forEach((b) => b.classList.remove('active'));
  selectedSize = null;
}

window.showStore = showStore;
window.showLanding = showLanding;
