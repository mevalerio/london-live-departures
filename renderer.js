const METERS_PER_MILE = 1609.34;
let userLat = 51.5074;
let userLon = -0.1278; // Default to central London if IP fails
let refreshInterval;
let allArrivals = {};

const DOM = {
  loader: document.getElementById('loader'),
  container: document.getElementById('stations-container'),
  locationText: document.getElementById('location-text'),
  settingsBtn: document.getElementById('settings-btn'),
  closeBtn: document.getElementById('close-btn'),
  settingsPanel: document.getElementById('settings-panel'),
  radiusInput: document.getElementById('radius'),
  radiusVal: document.getElementById('radius-val'),
  refreshInput: document.getElementById('auto-refresh'),
  postcodeInput: document.getElementById('postcode'),
  saveBtn: document.getElementById('save-settings')
};

// Controls
if (window.electronAPI) {
  DOM.closeBtn.addEventListener('click', () => window.electronAPI.closeWidget());
} else {
  DOM.closeBtn.style.display = 'none'; // hide if not in electron
}

DOM.settingsBtn.addEventListener('click', () => {
  DOM.settingsPanel.classList.toggle('hidden');
});

DOM.radiusInput.addEventListener('input', (e) => {
  DOM.radiusVal.textContent = e.target.value;
});

DOM.saveBtn.addEventListener('click', async () => {
  const postcode = DOM.postcodeInput.value.trim();
  if (postcode) {
    DOM.loader.style.display = 'flex';
    DOM.container.innerHTML = '';
    DOM.loader.querySelector('p').textContent = 'Looking up postcode...';
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
      if (res.ok) {
        const data = await res.json();
        userLat = data.result.latitude;
        userLon = data.result.longitude;
        DOM.locationText.textContent = postcode.toUpperCase();
      } else {
        alert('Invalid Postcode');
        return;
      }
    } catch(e) {
      alert('Error looking up postcode');
      return;
    }
  }

  DOM.settingsPanel.classList.add('hidden');
  initDashboard();
});

function getBadgeClass(modeName) {
  if (modeName === 'bus') return 'badge-bus';
  if (modeName === 'tube' || modeName === 'underground') return 'badge-tube';
  if (modeName === 'national-rail' || modeName === 'overground') return 'badge-train';
  return 'badge-default';
}

function formatTime(seconds, status) {
  if (status === 'Cancelled') return '<span class="time-due" style="color: #ff3b30; font-size: 12px;">Cancelled</span>';
  if (status === 'Delayed') return '<span class="time-due" style="color: #ff9500; font-size: 12px;">Delayed</span>';
  if (seconds < 60) return '<span class="time-due">Due</span>';
  const mins = Math.floor(seconds / 60);
  return `<span class="time-min">${mins} min</span>`;
}

async function getIpLocation() {
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) throw new Error('IP API failed');
    const data = await res.json();
    if (data.latitude && data.longitude) {
      userLat = data.latitude;
      userLon = data.longitude;
      DOM.locationText.textContent = `${data.city || 'Location found (IP)'}`;
    }
  } catch (err) {
    console.error('IP Location error:', err);
    DOM.locationText.textContent = 'London (Default)';
  }
}

async function getLocation() {
  return new Promise((resolve) => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          userLat = position.coords.latitude;
          userLon = position.coords.longitude;
          try {
            const res = await fetch(`https://api.postcodes.io/postcodes?lon=${userLon}&lat=${userLat}`);
            if (res.ok) {
              const data = await res.json();
              if (data.result && data.result.length > 0) {
                DOM.locationText.textContent = data.result[0].admin_ward || data.result[0].postcode || 'Precise Location';
              } else {
                DOM.locationText.textContent = 'Precise Location';
              }
            } else {
              DOM.locationText.textContent = 'Precise Location';
            }
          } catch(e) {
            DOM.locationText.textContent = 'Precise Location';
          }
          resolve();
        },
        async (error) => {
          console.log('Geolocation failed or denied, falling back to IP.', error);
          await getIpLocation();
          resolve();
        },
        { timeout: 5000, enableHighAccuracy: true }
      );
    } else {
      getIpLocation().then(resolve);
    }
  });
}

async function fetchNearbyStations(lat, lon, radiusMeters) {
  const types = 'NaptanPublicBusCoachTram,NaptanMetroStation,NaptanRailStation';
  const url = `https://api.tfl.gov.uk/StopPoint?lat=${lat}&lon=${lon}&stopTypes=${types}&radius=${radiusMeters}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('TfL StopPoint API failed');
  const data = await res.json();
  return data.stopPoints || [];
}

async function fetchArrivals(stationId, stationName) {
  const res = await fetch(`https://api.tfl.gov.uk/StopPoint/${stationId}/Arrivals`);
  let data = [];
  if (res.ok) {
    data = await res.json();
  }
  
  // Fallback to Huxley 2 for National Rail if TfL returns empty
  if (data.length === 0 && stationName && stationName.includes('Rail Station')) {
    const cleanName = stationName.replace(' Rail Station', '').replace('London ', '').trim();
    try {
      const hRes = await fetch(`https://huxley2.azurewebsites.net/departures/${encodeURIComponent(cleanName)}`);
      if (hRes.ok) {
        const hData = await hRes.json();
        if (hData.trainServices) {
          data = hData.trainServices.map(ts => {
            let minutes = 0;
            const timeStr = (ts.etd === 'On time' || ts.etd === 'Cancelled' || ts.etd === 'Delayed') ? ts.std : ts.etd;
            
            if (timeStr && timeStr.includes(':')) {
              const now = new Date();
              const [h, m] = timeStr.split(':');
              const dep = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
              if (dep < now) dep.setDate(dep.getDate() + 1);
              minutes = Math.round((dep - now) / 60000);
            }
            
            return {
              modeName: 'national-rail',
              lineName: ts.operator || 'National Rail',
              destinationName: (ts.destination && ts.destination.length > 0) ? ts.destination[0].locationName : 'Unknown',
              timeToStation: Math.max(0, minutes * 60),
              status: ts.etd,
              platform: ts.platform || ''
            };
          });
        }
      }
    } catch(e) {
      console.error('Huxley API error:', e);
    }
  }
  
  return data;
}

function renderArrivals(station, arrivals) {
  const letterBadge = station.stopLetter ? `<span style="background: rgba(255,255,255,0.2); font-size: 11px; padding: 2px 6px; border-radius: 4px; margin-left: 6px; white-space: nowrap; vertical-align: middle;">Stop ${station.stopLetter.replace('Stop ', '')}</span>` : '';

  let html = `<div class="station-card">
    <div class="station-header">
      <div class="station-name" style="display: flex; align-items: center;">${station.commonName}${letterBadge}</div>
      <div class="station-distance">${Math.round(station.distance)}m</div>
    </div>
    <div class="arrival-list">`;

  if (arrivals.length === 0) {
    html += `<div class="arrival-item" style="justify-content: center; color: var(--text-secondary); font-size: 13px;">No live data available</div>`;
  } else {
    // Sort by time
    arrivals.sort((a, b) => a.timeToStation - b.timeToStation);
    
    // Take top 3 for compactness
    const topArrivals = arrivals.slice(0, 3);
      
    topArrivals.forEach(arr => {
      const safeLine = (arr.lineId || arr.lineName).replace(/'/g, "\\'");
      const safeDest = (arr.destinationName || '').replace(/'/g, "\\'");
      let platformBadge = '';
      if (arr.modeName !== 'bus' && arr.modeName !== 'tube' && arr.modeName !== 'underground') {
        const platformText = arr.platformName ? `Plat ${arr.platformName.replace(/Platform /ig, '')}` : (arr.platform ? `Plat ${arr.platform}` : '');
        platformBadge = platformText ? `<span style="font-size: 11px; background: rgba(255,255,255,0.1); padding: 2px 5px; border-radius: 4px; margin-left: 6px; color: #d0d0d0; white-space: nowrap;">${platformText}</span>` : '';
      }
      
      html += `
        <div class="arrival-item" onclick="window.toggleNextArrivals(this, '${station.naptanId}', '${safeLine}', '${safeDest}')" style="cursor: pointer;" title="Click to see later arrivals">
          <div class="route-info">
            <span class="line-badge ${getBadgeClass(arr.modeName)}">${arr.lineId || arr.lineName}</span>
            <span class="destination">${arr.destinationName}${platformBadge}</span>
          </div>
          <div class="time-info">${formatTime(arr.timeToStation, arr.status)}</div>
        </div>
        <div class="next-arrivals hidden"></div>
      `;
    });
  }
  
  html += `</div></div>`;
  return html;
}

async function initDashboard() {
  DOM.loader.style.display = 'flex';
  DOM.container.innerHTML = '';
  
  const radiusMiles = parseFloat(DOM.radiusInput.value);
  const radiusMeters = Math.round(radiusMiles * METERS_PER_MILE);
  
  try {
    const stations = await fetchNearbyStations(userLat, userLon, radiusMeters);
    
    if (stations.length === 0) {
      DOM.container.innerHTML = `<div class="error-message">No stations found within ${radiusMiles} mile(s).</div>`;
      DOM.loader.style.display = 'none';
      return;
    }
    
    // Sort stations by distance
    stations.sort((a, b) => a.distance - b.distance);
    
    // Take top 10 closest stations to avoid rate limits / UI clutter
    const topStations = stations.slice(0, 10);
    
    let fullHtml = '';
    
    // Fetch arrivals for each station
    for (const station of topStations) {
      const arrivals = await fetchArrivals(station.naptanId, station.commonName);
      allArrivals[station.naptanId] = arrivals;
      fullHtml += renderArrivals(station, arrivals);
    }
    
    if (!fullHtml) {
      fullHtml = `<div class="error-message">No live arrivals right now.</div>`;
    }
    
    DOM.container.innerHTML = fullHtml;
  } catch (err) {
    console.error(err);
    DOM.container.innerHTML = `<div class="error-message">Error fetching live data.</div>`;
  }
  
  DOM.loader.style.display = 'none';
  
  // Setup auto refresh
  if (refreshInterval) clearInterval(refreshInterval);
  const refreshSecs = parseInt(DOM.refreshInput.value);
  refreshInterval = setInterval(() => {
    updateArrivalsSilently(radiusMeters);
  }, refreshSecs * 1000);
}

// Update without showing full loader, to keep UI smooth
async function updateArrivalsSilently(radiusMeters) {
  try {
    const stations = await fetchNearbyStations(userLat, userLon, radiusMeters);
    if (stations.length === 0) return;
    stations.sort((a, b) => a.distance - b.distance);
    const topStations = stations.slice(0, 10);
    
    let fullHtml = '';
    for (const station of topStations) {
      const arrivals = await fetchArrivals(station.naptanId, station.commonName);
      allArrivals[station.naptanId] = arrivals;
      fullHtml += renderArrivals(station, arrivals);
    }
    if (fullHtml) {
      DOM.container.innerHTML = fullHtml;
    }
  } catch(e) {
    console.log("Silent update failed", e);
  }
}

// Start
async function bootstrap() {
  await getLocation();
  initDashboard();
}

window.toggleNextArrivals = function(element, stationId, lineName, destinationName) {
  const nextDiv = element.nextElementSibling;
  if (!nextDiv.classList.contains('hidden')) {
     nextDiv.classList.add('hidden');
     return;
  }
  
  const arrivals = allArrivals[stationId] || [];
  const lineArrivals = arrivals.filter(a => (a.lineId || a.lineName) === lineName && a.destinationName === destinationName);
  
  if (lineArrivals.length <= 1) {
     nextDiv.innerHTML = '<div style="font-size: 11px; padding: 4px 12px; color: var(--text-secondary);">No further arrivals scheduled</div>';
  } else {
     let subHtml = '';
     for (let i = 1; i < lineArrivals.length; i++) {
        const arr = lineArrivals[i];
        subHtml += `<div style="font-size: 11px; padding: 3px 12px; color: var(--text-secondary); display: flex; justify-content: space-between;">
           <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">Next: ${arr.destinationName}</span>
           <span>${formatTime(arr.timeToStation, arr.status)}</span>
        </div>`;
     }
     nextDiv.innerHTML = subHtml;
  }
  nextDiv.classList.remove('hidden');
};

bootstrap();
