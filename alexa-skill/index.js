const Alexa = require('ask-sdk-core');
const axios = require('axios');

const departureBoardDocument = {
    "type": "APL",
    "version": "2023.2",
    "theme": "dark",
    "mainTemplate": {
        "parameters": [ "headerData", "trainList" ],
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
                    "text": "${headerData.stationName}",
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
                    "data": "${trainList}",
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

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak('Welcome to London Departures. Say, check my stations.')
            .reprompt('Would you like to hear the next departures?')
            .getResponse();
    }
};

const GetDeparturesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest'
            || (Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetDeparturesIntent');
    },
    async handle(handlerInput) {
        const { requestEnvelope, serviceClientFactory, responseBuilder } = handlerInput;

        try {
            const deviceId = requestEnvelope.context.System.device.deviceId;
            const deviceAddressClient = serviceClientFactory.getDeviceAddressServiceClient();
            
            let address;
            try {
                address = await deviceAddressClient.getFullAddress(deviceId);
            } catch (permError) {
                console.error("Permission error details:", permError);
                return responseBuilder
                    .speak("I am hitting the fallback because Amazon blocked the location. The exact error is: " + (permError.message || permError.name) + ". Please make sure Device Address is turned on in the Alexa App settings.")
                    .getResponse();
            }
            
            if (!address || !address.postalCode) {
                return responseBuilder
                    .speak("I am hitting the fallback because your Echo Show device does not have a physical address set in its local device settings.")
                    .getResponse();
            }

            const safePostcode = encodeURIComponent(address.postalCode.trim());
            const geoRes = await axios.get('https://api.postcodes.io/postcodes/' + safePostcode);
            const { latitude, longitude } = geoRes.data.result;

            const radius = 2000; 
            const stopTypes = 'NaptanPublicBusCoachTram,NaptanMetroStation,NaptanRailStation'; 
            
            const tflUrl = 'https://api.tfl.gov.uk/StopPoint?lat=' + latitude + '&lon=' + longitude + '&stopTypes=' + stopTypes + '&radius=' + radius;
                           
            const tflRes = await axios.get(tflUrl);
            const stopPoints = tflRes.data.stopPoints;
            
            if (!stopPoints || stopPoints.length === 0) {
                return responseBuilder
                    .speak('I could not find any transport stops within your radius.')
                    .getResponse();
            }

            const limitStops = Math.min(stopPoints.length, 3);
            const fetchPromises = [];
            
            for (let i = 0; i < limitStops; i++) {
                const stop = stopPoints[i];
                const stopId = stop.naptanId || stop.id;
                const arrivalsUrl = 'https://api.tfl.gov.uk/StopPoint/' + stopId + '/Arrivals';
                
                const p = axios.get(arrivalsUrl).then(depRes => {
                    return { stop: stop, data: depRes.data || [] };
                }).catch(e => {
                    console.log("Failed to fetch arrivals for stop", stopId);
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

            let speakOutput = '';
            
            if (mappedArrivals.length > 0) {
                let closestTrain = null;
                mappedArrivals.forEach(arr => {
                    if (!arr.isHeader && (!closestTrain || arr.timeToStation < closestTrain.timeToStation)) {
                        closestTrain = arr;
                    }
                });
                
                if (closestTrain) {
                    const nextMins = Math.round(closestTrain.timeToStation / 60);
                    let speakPhrase = nextMins === 0 ? 'is due now' : 'will arrive in ' + nextMins + ' minutes';
                    speakOutput = 'At ' + closestTrain.rawStopName + ', the next ' + (closestTrain.line || 'service') + ' towards ' + (closestTrain.destination || 'its destination') + ' ' + speakPhrase + '.';
                }
            } else {
                mappedArrivals = [{ isHeader: false, line: 'No departures', destination: 'listed', time: '--' }];
                speakOutput = 'I found local stops, but there are no departures listed right now.';
            }

            const supportedInterfaces = Alexa.getSupportedInterfaces(requestEnvelope);
            if (supportedInterfaces && supportedInterfaces['Alexa.Presentation.APL']) {
                responseBuilder.addDirective({
                    type: 'Alexa.Presentation.APL.RenderDocument',
                    token: 'departureToken',
                    document: departureBoardDocument,
                    datasources: {
                        headerData: {
                            type: 'object',
                            properties: {
                                stationName: "Local Departures"
                            }
                        },
                        trainList: {
                            type: 'list',
                            listId: 'trains',
                            items: mappedArrivals
                        }
                    }
                });
            }
                                
            return responseBuilder.speak(speakOutput).getResponse();

        } catch (error) {
            console.error('Error details:', error);
            let errMsg = error.message;
            if (error.response && error.response.status) {
                errMsg = 'Status ' + error.response.status;
            }
            return responseBuilder.speak('I crashed. The exact error is: ' + errMsg).getResponse();
        }
    }
};

const WidgetEventHandler = {
    canHandle(handlerInput) {
        const type = Alexa.getRequestType(handlerInput.requestEnvelope);
        return type === 'Alexa.DataStore.PackageManager.UsagesInstalled' ||
               type === 'Alexa.DataStore.PackageManager.UpdateRequest' ||
               type === 'Alexa.DataStore.PackageManager.UsagesRemoved';
    },
    handle(handlerInput) {
        console.log("🔥 WIDGET BACKGROUND PING RECEIVED!");
        console.log(JSON.stringify(handlerInput.requestEnvelope.request, null, 2));
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
