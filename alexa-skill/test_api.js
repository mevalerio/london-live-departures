const axios = require('axios');

async function test() {
    try {
        console.log("1. Starting test...");
        const address = { postalCode: 'SE1 8SW' }; // Simulator fallback
        const safePostcode = encodeURIComponent(address.postalCode.trim());
        
        console.log("2. Fetching coordinates for " + safePostcode);
        const geoRes = await axios.get('https://api.postcodes.io/postcodes/' + safePostcode);
        const { latitude, longitude } = geoRes.data.result;
        console.log(`   -> Lat: ${latitude}, Lon: ${longitude}`);

        const radius = 1600;
        const stopTypes = 'NaptanPublicBusCoachTram,NaptanMetroStation,NaptanRailStation';
        
        const tflUrl = 'https://api.tfl.gov.uk/StopPoint?lat=' + latitude + '&lon=' + longitude + '&stopTypes=' + stopTypes + '&radius=' + radius;
        console.log("3. Fetching TfL Stops at URL:\n   " + tflUrl);
        const tflRes = await axios.get(tflUrl);
        const stopPoints = tflRes.data.stopPoints;
        console.log(`   -> Found ${stopPoints.length} stops nearby.`);
        
        const closestStop = stopPoints[0];
        const stopId = closestStop.naptanId || closestStop.id;
        console.log(`4. Closest stop is ${closestStop.commonName} (ID: ${stopId})`);
        
        const arrivalsUrl = 'https://api.tfl.gov.uk/StopPoint/' + stopId + '/Arrivals';
        console.log("5. Fetching Arrivals at URL:\n   " + arrivalsUrl);
        const depRes = await axios.get(arrivalsUrl);
        const arrivals = depRes.data;
        
        if (arrivals && arrivals.length > 0) {
            arrivals.sort((a, b) => a.timeToStation - b.timeToStation);
            const next = arrivals[0];
            const minutes = Math.round(next.timeToStation / 60);
            
            console.log(`\n🎉 SUCCESS! Resulting Speech:`);
            console.log(`"At ${closestStop.commonName}, the next ${next.lineName || 'train'} towards ${next.destinationName || 'its destination'} will arrive in ${minutes} minutes."`);
        } else {
            console.log("No arrivals listed right now.");
        }
    } catch (error) {
        console.error("❌ ERROR CAUGHT:");
        if (error.response && error.response.status) {
            console.error('API failed with status code ' + error.response.status + ' on link ' + error.config.url);
        } else {
            console.error(error.message);
        }
    }
}

test();
