const Alexa = require('ask-sdk-core');
const axios = require('axios');

const departureBoardDocument = {
    "type": "APL",
    "version": "2023.2",
    "theme": "dark",
    "mainTemplate": {
        "parameters": ["trainList", "headerData"],
        "item": {
            "type": "Container",
            "width": "100%",
            "height": "100%",
            "backgroundColor": "#111111",
            "paddingLeft": "16dp",
            "paddingRight": "16dp",
            "paddingTop": "16dp",
            "items": [
                {
                    "type": "Text",
                    "text": "${headerData.properties.stationName}",
                    "fontSize": "30dp",
                    "color": "#FFFFFF",
                    "fontWeight": "bold",
                    "paddingBottom": "20dp",
                    "maxLines": 1
                },
                {
                    "type": "Sequence",
                    "width": "100%",
                    "height": "100%",
                    "data": "${trainList.items}",
                    "item": {
                        "type": "Text",
                        "text": "${data.line} to ${data.destination}  •  ${data.time}",
                        "fontSize": "22dp",
                        "color": "#FFD700",
                        "paddingBottom": "15dp",
                        "maxLines": 1
                    }
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
        const speakOutput = 'Welcome to London Departures. You can ask for your next trains or buses.';
        return handlerInput.responseBuilder
            .speak(speakOutput)
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
                    .speak('I could not find any transport stops within a mile of you.')
                    .getResponse();
            }

            const limitStops = Math.min(stopPoints.length, 3);
            let allArrivals = [];
            
            const fetchPromises = [];
            for (let i = 0; i < limitStops; i++) {
                const stop = stopPoints[i];
                const stopId = stop.naptanId || stop.id;
                const arrivalsUrl = 'https://api.tfl.gov.uk/StopPoint/' + stopId + '/Arrivals';
                
                const p = axios.get(arrivalsUrl).then(depRes => {
                    if (depRes.data && depRes.data.length > 0) {
                        depRes.data.forEach(arr => {
                            let displayName = stop.commonName.replace(' Underground Station', '').replace(' Station', '');
                            if (stop.indicator && stop.indicator !== 'null') {
                                displayName = stop.indicator.includes('Stop') ? stop.indicator : 'Stop ' + stop.indicator;
                            }
                            arr.stationName = displayName;
                        });
                        return depRes.data;
                    }
                    return [];
                }).catch(e => {
                    console.log("Failed to fetch arrivals for stop", stopId);
                    return [];
                });
                
                fetchPromises.push(p);
            }
            
            const results = await Promise.all(fetchPromises);
            results.forEach(res => {
                allArrivals = allArrivals.concat(res);
            });

            let mappedArrivals = [];
            let speakOutput = '';

            if (allArrivals.length > 0) {
                allArrivals.sort((a, b) => a.timeToStation - b.timeToStation);
                
                const limit = Math.min(allArrivals.length, 8);
                for (let i = 0; i < limit; i++) {
                    const next = allArrivals[i];
                    const minutes = Math.round(next.timeToStation / 60);
                    let timePhrase = minutes === 0 ? 'Due' : minutes + ' min';
                    
                    mappedArrivals.push({
                        line: (next.lineName || 'Unknown') + ' (' + (next.stationName || 'Local') + ')',
                        destination: next.destinationName || 'Unknown',
                        time: timePhrase
                    });
                }
                
                const nextTrain = allArrivals[0];
                const nextMins = Math.round(nextTrain.timeToStation / 60);
                let speakPhrase = nextMins === 0 ? 'is due now' : 'will arrive in ' + nextMins + ' minutes';
                speakOutput = 'At ' + nextTrain.stationName + ', the next ' + (nextTrain.lineName || 'service') + ' towards ' + (nextTrain.destinationName || 'its destination') + ' ' + speakPhrase + '.';
                
            } else {
                mappedArrivals = [{ line: 'No departures', destination: 'listed', time: '--' }];
                speakOutput = 'I found local stops, but there are no departures listed right now.';
            }

            const supportedInterfaces = Alexa.getSupportedInterfaces(requestEnvelope);
            if (supportedInterfaces && supportedInterfaces['Alexa.Presentation.APL']) {
                responseBuilder.addDirective({
                    type: 'Alexa.Presentation.APL.RenderDocument',
                    token: 'departureToken',
                    document: departureBoardDocument,
                    datasources: {
                        trainList: {
                            type: 'list',
                            listId: 'trains',
                            items: mappedArrivals
                        },
                        headerData: {
                            type: 'object',
                            properties: {
                                stationName: "Local Departures"
                            }
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
        
        // Return a successful blank response so Alexa knows we are alive
        return handlerInput.responseBuilder.getResponse();
    }
};

const ErrorHandler = {
    canHandle() { return true; },
    handle(handlerInput, error) {
        console.log('Error handled: ' + error.message);
        return handlerInput.responseBuilder.speak('Sorry, something went wrong.').getResponse();
    }
};


const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);
        return handlerInput.responseBuilder.getResponse(); // Must be empty
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

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(GetDeparturesIntentHandler, LaunchRequestHandler, WidgetEventHandler, SessionEndedRequestHandler, FallbackIntentHandler)
    .addErrorHandlers(ErrorHandler)
    .withApiClient(new Alexa.DefaultApiClient()) 
    .lambda();
