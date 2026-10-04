const axios = require('axios');
async function test() {
    try {
        const geoRes = await axios.get('https://api.postcodes.io/postcodes/SW1A%202JR');
        const { latitude, longitude } = geoRes.data.result;
        console.log("Lat:", latitude, "Lon:", longitude);
        const tflUrl = 'https://api.tfl.gov.uk/StopPoint?lat=' + latitude + '&lon=' + longitude + '&stopTypes=NaptanPublicBusCoachTram,NaptanMetroStation,NaptanRailStation&radius=1600';
        const tflRes = await axios.get(tflUrl);
        const closestStop = tflRes.data.stopPoints[0];
        console.log("Closest:", closestStop.commonName, "ID:", closestStop.naptanId || closestStop.id);
        const arrivalsUrl = 'https://api.tfl.gov.uk/StopPoint/' + (closestStop.naptanId || closestStop.id) + '/Arrivals';
        const depRes = await axios.get(arrivalsUrl);
        console.log("Arrivals count:", depRes.data.length);
    } catch(e) {
        console.error(e.message);
    }
}
test();
