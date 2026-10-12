const Alexa = require('ask-sdk-core');
const axios = require('axios');

const departureBoardDocument = {
    "type": "APL",
    "version": "1.4",
    "theme": "dark",
    "mainTemplate": {
        "parameters": [ "trainList", "headerData" ],
        "item": {
            "type": "Container",
            "width": "100%",
            "height": "100%",
            "backgroundColor": "#111111",
            "paddingLeft": "16dp",
            "paddingRight": "16dp",
            "paddingTop": "16dp",
            "paddingBottom": "16dp",
            "items": [
                {
                    "type": "Text",
                    "text": "${headerData.properties.stationName}",
                    "fontSize": "26dp",
                    "color": "#FFFFFF",
                    "fontWeight": "bold",
                    "paddingBottom": "5dp",
                    "maxLines": 1
                },
                {
                    "type": "Sequence",
                    "width": "100%",
                    "height": "100%",
                    "data": "${trainList.properties.items}",
                    "item": [
                        {
                            "when": "${data.isHeader}",
                            "type": "Text",
                            "text": "${data.title}",
                            "fontSize": "18dp",
                            "color": "#AAAAAA",
                            "fontWeight": "bold",
                            "paddingTop": "12dp",
                            "paddingBottom": "4dp"
                        },
                        {
                            "type": "Container",
                            "direction": "row",
                            "width": "100%",
                            "paddingTop": "4dp",
                            "paddingBottom": "4dp",
                            "justifyContent": "spaceBetween",
                            "items": [
                                {
                                    "type": "Text",
                                    "text": "${data.line} to ${data.destination}",
                                    "fontSize": "18dp",
                                    "color": "#FFD700",
                                    "shrink": 1,
                                    "maxLines": 1
                                },
                                {
                                    "type": "Text",
                                    "text": "${data.time}",
                                    "fontSize": "20dp",
                                    "color": "#00FF00",
                                    "fontWeight": "bold"
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    }
};

let LWA_CLIENT_ID = process.env.LWA_CLIENT_ID || "";
let LWA_CLIENT_SECRET = process.env.LWA_CLIENT_SECRET || "";
try {
    const creds = require('./credentials.json');
    if (creds.clientId) LWA_CLIENT_ID = creds.clientId;
    if (creds.clientSecret) LWA_CLIENT_SECRET = creds.clientSecret;
} catch (e) {}

let cachedDataStoreToken = null;
let tokenExpiresAt = 0;

async function getDataStoreToken() {
    const now = Date.now();
    if (cachedDataStoreToken && now < tokenExpiresAt - 60000) {
        return cachedDataStoreToken;
    }
    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", LWA_CLIENT_ID);
    params.append("client_secret", LWA_CLIENT_SECRET);
    params.append("scope", "alexa::datastore");

    const res = await axios.post("https://api.amazon.com/auth/o2/token", params.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    cachedDataStoreToken = res.data.access_token;
    tokenExpiresAt = now + ((res.data.expires_in || 3600) * 1000);
    return cachedDataStoreToken;
}

const locationCache = new Map();

async function resolveCoordinates(handlerInput) {
    const { requestEnvelope, serviceClientFactory } = handlerInput;
    const system = (requestEnvelope.context && requestEnvelope.context.System) || {};
    const device = system.device || null;
    const deviceId = device ? device.deviceId : null;
    const user = system.user || null;
    const userId = user ? user.userId : null;

    let lat = null;
    let lon = null;
    let locationSource = 'none';
    let permissionDenied = false;
    let noAddressSet = false;

    if (deviceId && serviceClientFactory) {
        let address = null;
        try {
            const deviceAddressClient = serviceClientFactory.getDeviceAddressServiceClient();
            try {
                address = await deviceAddressClient.getFullAddress(deviceId);
                console.log("DeviceAddressClient getFullAddress succeeded:", JSON.stringify(address));
            } catch (errFull) {
                console.log("getFullAddress error:", errFull.statusCode || errFull.message);
                if (errFull.statusCode === 403 || (errFull.name === 'ServiceError' && errFull.statusCode === 403)) {
                    permissionDenied = true;
                }
                try {
                    address = await deviceAddressClient.getCountryAndPostalCode(deviceId);
                    console.log("DeviceAddressClient getCountryAndPostalCode succeeded:", JSON.stringify(address));
                } catch (errCountry) {
                    console.log("getCountryAndPostalCode error:", errCountry.statusCode || errCountry.message);
                    if (errCountry.statusCode === 403 || (errCountry.name === 'ServiceError' && errCountry.statusCode === 403)) {
                        permissionDenied = true;
                    }
                }
            }

            if (address) {
                const postcode = address.postalCode ? address.postalCode.trim().toUpperCase() : null;
                if (postcode) {
                    permissionDenied = false;
                    try {
                        const geoUrl = 'https://api.postcodes.io/postcodes/' + encodeURIComponent(postcode);
                        const geoRes = await axios.get(geoUrl, { timeout: 4000 });
                        if (geoRes.data && geoRes.data.result) {
                            lat = geoRes.data.result.latitude;
                            lon = geoRes.data.result.longitude;
                            locationSource = 'device_postcode (' + postcode + ')';
                            console.log(`Resolved postcode ${postcode} -> lat: ${lat}, lon: ${lon}`);
                            if (userId) locationCache.set(userId, { lat, lon, postcode });
                            if (deviceId) locationCache.set(deviceId, { lat, lon, postcode });
                        }
                    } catch (geoErr) {
                        console.error(`postcodes.io lookup failed for ${postcode}:`, geoErr.message);
                    }
                } else if (!permissionDenied) {
                    noAddressSet = true;
                    console.log("Device address returned but postalCode field is empty.");
                }
            }
        } catch (clientErr) {
            console.error("Device address client error:", clientErr.message);
        }
    }

    if (lat === null || lon === null) {
        const cached = (userId && locationCache.get(userId)) || (deviceId && locationCache.get(deviceId));
        if (cached) {
            lat = cached.lat;
            lon = cached.lon;
            locationSource = 'cache (' + cached.postcode + ')';
            console.log(`Using cached location: ${locationSource} -> lat: ${lat}, lon: ${lon}`);
        }
    }

    if (lat === null || lon === null) {
        lat = 51.5014;
        lon = -0.1250;
        locationSource = 'default (Westminster)';
        console.log(`Falling back to default Central London (${locationSource})`);
    }

    return { lat, lon, locationSource, permissionDenied, noAddressSet, userId, deviceId };
}

async function pushToDataStore(endpoint, targetInfo, mappedArrivals, stationName) {
    if (!endpoint || !targetInfo) {
        return;
    }
    const target = targetInfo.userId
        ? { type: "USER", id: targetInfo.userId }
        : (targetInfo.deviceId ? { type: "DEVICES", items: [targetInfo.deviceId] } : null);

    if (!target) {
        return;
    }

    const validArrivals = mappedArrivals && mappedArrivals.length > 0
        ? mappedArrivals
        : [{ isHeader: false, line: "No departures", destination: "listed", time: "--" }];
    const validStationName = stationName || "Local Departures";
    const now = new Date();
    const updatedTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

    try {
        const token = await getDataStoreToken();
        const dsUrl = endpoint + '/v1/datastore/commands';
        const payload = {
            target: target,
            commands: [
                {
                    type: "PUT_OBJECT",
                    namespace: "LondonDepartures",
                    key: "liveBoard",
                    content: {
                        type: "object",
                        stationName: validStationName,
                        arrivals: validArrivals,
                        properties: {
                            stationName: validStationName,
                            arrivals: validArrivals
                        }
                    }
                }
            ]
        };
        const res = await axios.post(dsUrl, payload, {
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        });
        console.log("DataStore push status:", res.status, "updatedTime:", updatedTime);
    } catch (err) {
        console.error("DataStore push failed:", err.message);
    }
}

async function fetchDeparturesForLocation(lat, lon) {
    const radius = 2000;
    const url = 'https://api.tfl.gov.uk/StopPoint/?lat=' + lat + '&lon=' + lon + '&stopTypes=NaptanPublicBusCoachTram,NaptanMetroStation,NaptanRailStation&radius=' + radius;
    
    let res = await axios.get(url, { timeout: 4000 });
    let stopPoints = res.data.stopPoints || [];
    if (stopPoints.length === 0) return [];

    const limitStops = Math.min(stopPoints.length, 3);
    const fetchPromises = [];
    
    for (let i = 0; i < limitStops; i++) {
        const stop = stopPoints[i];
        const stopId = stop.naptanId || stop.id;
        const arrivalsUrl = 'https://api.tfl.gov.uk/StopPoint/' + stopId + '/Arrivals';
        
        const p = axios.get(arrivalsUrl, { timeout: 4000 }).then(depRes => {
            return { stop: stop, data: depRes.data || [] };
        }).catch(e => {
            return { stop: stop, data: [] };
        });
        fetchPromises.push(p);
    }
    
    const results = await Promise.all(fetchPromises);
    let mappedArrivals = [];
    
    results.forEach(res => {
        const stop = res.stop;
        const arrivals = res.data;
        if (arrivals.length === 0) return;
        
        const platformGroups = {};
        
        arrivals.forEach(arr => {
            let pName = arr.platformName && arr.platformName !== 'null' ? arr.platformName : '';
            if (stop.indicator && stop.indicator !== 'null' && !pName.includes(stop.indicator)) {
                let ind = stop.indicator.includes('Stop') ? stop.indicator : 'Stop ' + stop.indicator;
                if (!pName) pName = ind;
            }
            
            let sName = stop.commonName.replace(' Underground Station', '').replace(' Station', '');
            let groupKey = sName;
            if (pName) groupKey += ' (' + pName + ')';
            
            if (!platformGroups[groupKey]) platformGroups[groupKey] = [];
            platformGroups[groupKey].push(arr);
        });
        
        for (const [key, groupArrivals] of Object.entries(platformGroups)) {
            groupArrivals.sort((a, b) => a.timeToStation - b.timeToStation);
            mappedArrivals.push({ isHeader: true, title: key });
            
            const limit = Math.min(groupArrivals.length, 4);
            for (let i = 0; i < limit; i++) {
                const next = groupArrivals[i];
                const minutes = Math.round(next.timeToStation / 60);
                let timePhrase = minutes === 0 ? 'Due' : minutes + ' min';
                
                mappedArrivals.push({
                    isHeader: false,
                    line: next.lineName || 'Unknown',
                    destination: next.destinationName || 'Unknown',
                    time: timePhrase,
                    timeToStation: next.timeToStation,
                    rawStopName: stop.commonName
                });
            }
        }
    });
    return mappedArrivals;
}

const GetDeparturesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest'
            || (Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetDeparturesIntent');
    },
    async handle(handlerInput) {
        const { requestEnvelope, responseBuilder } = handlerInput;

        const loc = await resolveCoordinates(handlerInput);
        const { lat, lon, permissionDenied, noAddressSet, userId, deviceId } = loc;
        let stationDisplayName = "London Departures";

        let mappedArrivals = [];
        try {
            mappedArrivals = await fetchDeparturesForLocation(lat, lon);
        } catch (apiErr) {
            console.error("TfL API error:", apiErr.message);
        }

        let speakOutput = '';
        let closestTrain = null;
        if (mappedArrivals && mappedArrivals.length > 0) {
            for (const arr of mappedArrivals) {
                if (!arr.isHeader && (!closestTrain || arr.timeToStation < closestTrain.timeToStation)) {
                    closestTrain = arr;
                }
            }

            if (closestTrain) {
                stationDisplayName = closestTrain.rawStopName || "Local Departures";
                const nextMins = Math.round(closestTrain.timeToStation / 60);
                const speakPhrase = nextMins === 0 ? 'is due now' : 'will arrive in ' + nextMins + ' minutes';
                speakOutput = 'At ' + closestTrain.rawStopName + ', the next ' + (closestTrain.line || 'service') + ' towards ' + (closestTrain.destination || 'its destination') + ' ' + speakPhrase + '.';
            } else {
                speakOutput = 'Here are your live departures.';
            }
        } else {
            mappedArrivals = [{ isHeader: false, line: 'No departures', destination: 'listed', time: '--' }];
            speakOutput = 'I could not find any live departures right now.';
        }

        if (permissionDenied) {
            responseBuilder.withAskForPermissionsConsentCard(['read::alexa:device:all:address']);
            speakOutput = 'To show departures for your local stops, please enable device address permissions in the Alexa app. I have sent a permissions card to your app. ' + speakOutput;
        } else if (noAddressSet) {
            speakOutput = 'Your Echo device does not have an address configured in the Alexa app device settings. Showing central London departures for now. ' + speakOutput;
        }

        const supportedInterfaces = Alexa.getSupportedInterfaces(requestEnvelope);
        if (supportedInterfaces && supportedInterfaces['Alexa.Presentation.APL']) {
            responseBuilder.addDirective({
                type: 'Alexa.Presentation.APL.RenderDocument',
                token: 'departureToken',
                document: departureBoardDocument,
                datasources: {
                    trainList: {
                        type: 'object',
                        properties: {
                            items: mappedArrivals
                        }
                    },
                    headerData: {
                        type: 'object',
                        properties: {
                            stationName: stationDisplayName
                        }
                    }
                }
            });
        }

        const endpoint = (requestEnvelope.context && requestEnvelope.context.System && requestEnvelope.context.System.apiEndpoint)
            ? requestEnvelope.context.System.apiEndpoint
            : "https://api.eu.amazonalexa.com";

        if (userId || deviceId) {
            try {
                await pushToDataStore(endpoint, { userId, deviceId }, mappedArrivals, stationDisplayName);
            } catch (e) {
                console.error("Background widget push failed:", e.message);
            }
        }

        return responseBuilder.speak(speakOutput).getResponse();
    }
};

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        return GetDeparturesIntentHandler.handle(handlerInput);
    }
};

const WidgetEventHandler = {
    canHandle(handlerInput) {
        const type = Alexa.getRequestType(handlerInput.requestEnvelope);
        if (type === 'Alexa.Presentation.APL.UserEvent') {
            const args = handlerInput.requestEnvelope.request.arguments;
            return !args || args.length === 0 || args[0] === 'RefreshWidget';
        }
        return type === 'Alexa.DataStore.PackageManager.UsagesInstalled' ||
               type === 'Alexa.DataStore.PackageManager.UpdateRequest' ||
               type === 'Alexa.DataStore.PackageManager.UsagesRemoved';
    },
    async handle(handlerInput) {
        console.log("🔥 WIDGET EVENT RECEIVED:", handlerInput.requestEnvelope.request.type);
        const request = handlerInput.requestEnvelope.request;

        if (request.type === 'Alexa.DataStore.PackageManager.UsagesRemoved') {
            return handlerInput.responseBuilder.getResponse();
        }

        try {
            const { requestEnvelope } = handlerInput;
            const loc = await resolveCoordinates(handlerInput);
            const { lat, lon, userId, deviceId } = loc;

            const mappedArrivals = await fetchDeparturesForLocation(lat, lon);
            let stationDisplayName = "Local Departures";
            if (mappedArrivals && mappedArrivals.length > 0) {
                let closestTrain = null;
                for (const arr of mappedArrivals) {
                    if (!arr.isHeader && (!closestTrain || arr.timeToStation < closestTrain.timeToStation)) {
                        closestTrain = arr;
                    }
                }
                if (closestTrain && closestTrain.rawStopName) {
                    stationDisplayName = closestTrain.rawStopName;
                }
            }

            const endpoint = (requestEnvelope.context && requestEnvelope.context.System && requestEnvelope.context.System.apiEndpoint)
                ? requestEnvelope.context.System.apiEndpoint
                : "https://api.eu.amazonalexa.com";

            if (userId || deviceId) {
                await pushToDataStore(endpoint, { userId, deviceId }, mappedArrivals, stationDisplayName);
            }
        } catch (error) {
            console.error("Widget EventHandler error:", error.message);
        }

        return handlerInput.responseBuilder.getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);
        return handlerInput.responseBuilder.getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent' ||
                Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent' ||
                Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder.speak('Goodbye!').getResponse();
    }
};

const ErrorHandler = {
    canHandle() { return true; },
    handle(handlerInput, error) {
        console.log('Error handled: ' + error.message);
        return handlerInput.responseBuilder.speak('Sorry, something went wrong.').getResponse();
    }
};

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(GetDeparturesIntentHandler, LaunchRequestHandler, WidgetEventHandler, SessionEndedRequestHandler, FallbackIntentHandler)
    .addErrorHandlers(ErrorHandler)
    .withApiClient(new Alexa.DefaultApiClient()) 
    .lambda();
