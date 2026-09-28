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
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetDeparturesIntent';
    },
    async handle(handlerInput) {
        const { requestEnvelope, serviceClientFactory, responseBuilder } = handlerInput;

        try {
            const deviceId = requestEnvelope.context.System.device.deviceId;
            const deviceAddressClient = serviceClientFactory.getDeviceAddressServiceClient();
            
            let address;
            try {
                address = await deviceAddressClient.getCountryAndPostalCode(deviceId);
            } catch (permError) {
                address = { postalCode: 'SW1A 2JR' }; 
            }
            
            if (!address || !address.postalCode) {
                address = { postalCode: 'SW1A 2JR' }; 
            }

            const safePostcode = encodeURIComponent(address.postalCode.trim());
            const geoRes = await axios.get('https://api.postcodes.io/postcodes/' + safePostcode);
            const { latitude, longitude } = geoRes.data.result;

            const radius = 1600; 
            const stopTypes = 'NaptanPublicBusCoachTram,NaptanMetroStation,NaptanRailStation'; 
            
            const tflUrl = 'https://api.tfl.gov.uk/StopPoint?lat=' + latitude + '&lon=' + longitude + '&stopTypes=' + stopTypes + '&radius=' + radius;
                           
            const tflRes = await axios.get(tflUrl);
            const stopPoints = tflRes.data.stopPoints;
            
            if (!stopPoints || stopPoints.length === 0) {
                return responseBuilder
                    .speak('I could not find any transport stops within a mile of you.')
                    .getResponse();
            }

            const closestStop = stopPoints[0];
            const stopId = closestStop.naptanId || closestStop.id;
            
            const arrivalsUrl = 'https://api.tfl.gov.uk/StopPoint/' + stopId + '/Arrivals';
            const depRes = await axios.get(arrivalsUrl);
            const arrivals = depRes.data;

            let mappedArrivals = [];
            let speakOutput = '';

            if (arrivals && arrivals.length > 0) {
                arrivals.sort((a, b) => a.timeToStation - b.timeToStation);
                
                const limit = Math.min(arrivals.length, 5);
                for (let i = 0; i < limit; i++) {
                    const next = arrivals[i];
                    const minutes = Math.round(next.timeToStation / 60);
                    let timePhrase = minutes === 0 ? 'Due' : minutes + ' min';
                    
                    mappedArrivals.push({
                        line: next.lineName || 'Unknown',
                        destination: next.destinationName || 'Unknown',
                        time: timePhrase
                    });
                }
                
                const nextTrain = arrivals[0];
                const nextMins = Math.round(nextTrain.timeToStation / 60);
                let speakPhrase = nextMins === 0 ? 'is due now' : 'will arrive in ' + nextMins + ' minutes';
                speakOutput = 'At ' + closestStop.commonName + ', the next ' + (nextTrain.lineName || 'train') + ' towards ' + (nextTrain.destinationName || 'its destination') + ' ' + speakPhrase + '.';
                
            } else {
                mappedArrivals = [{ line: 'No departures', destination: 'listed', time: '--' }];
                speakOutput = 'I found ' + closestStop.commonName + ' nearby, but there are no departures listed right now.';
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
                                stationName: closestStop.commonName
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

const ErrorHandler = {
    canHandle() { return true; },
    handle(handlerInput, error) {
        console.log('Error handled: ' + error.message);
        return handlerInput.responseBuilder.speak('Sorry, something went wrong.').getResponse();
    }
};

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(LaunchRequestHandler, GetDeparturesIntentHandler)
    .addErrorHandlers(ErrorHandler)
    .withApiClient(new Alexa.DefaultApiClient()) 
    .lambda();
