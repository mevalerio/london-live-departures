const Alexa = require('ask-sdk-core');
const axios = require('axios');

const departureBoardDocument = {
    type: 'APL',
    version: '2023.2',
    mainTemplate: {
        parameters: ['payload'],
        item: {
            type: 'Container',
            width: '100%',
            height: '100%',
            backgroundColor: '#111111',
            alignItems: 'center',
            justifyContent: 'center',
            items: [
                {
                    type: 'Text',
                    text: '${payload.departureData.stationName}',
                    fontSize: '50dp',
                    color: '#FFFFFF',
                    fontWeight: 'bold',
                    paddingBottom: '20dp'
                },
                {
                    type: 'Frame',
                    backgroundColor: '#222222',
                    borderRadius: '15dp',
                    padding: '30dp',
                    width: '80%',
                    items: [
                        {
                            type: 'Text',
                            text: '${payload.departureData.lineName} Line to ${payload.departureData.destination}',
                            fontSize: '35dp',
                            color: '#FFD700',
                            textAlign: 'center'
                        },
                        {
                            type: 'Text',
                            text: '${payload.departureData.time}',
                            fontSize: '60dp',
                            color: '#00FF00',
                            fontWeight: 'bold',
                            textAlign: 'center',
                            paddingTop: '20dp'
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
                console.log('Permission denied by simulator. Forcing fallback to SE1 8SW.');
                address = { postalCode: 'SE1 8SW' };
            }
            
            if (!address || !address.postalCode) {
                address = { postalCode: 'SE1 8SW' }; 
            }

            const safePostcode = encodeURIComponent(address.postalCode.trim());
            const geoRes = await axios.get('https://api.postcodes.io/postcodes/' + safePostcode);
            const { latitude, longitude } = geoRes.data.result;

            const radius = 1600;
            const stopTypes = 'NaptanPublicBusCoachTram,NaptanMetro,NaptanRailStation';
            
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

            if (arrivals && arrivals.length > 0) {
                arrivals.sort((a, b) => a.timeToStation - b.timeToStation);
                const next = arrivals[0];
                const minutes = Math.round(next.timeToStation / 60);
                
                let timePhrase = minutes === 0 ? 'is due now' : 'in ' + minutes + ' mins';
                let speakPhrase = minutes === 0 ? 'is due now' : 'will arrive in ' + minutes + ' minutes';
                
                const speakOutput = 'At ' + closestStop.commonName + ', the next ' + (next.lineName || 'train') + ' towards ' + (next.destinationName || 'its destination') + ' ' + speakPhrase + '.';
                
                const supportedInterfaces = Alexa.getSupportedInterfaces(requestEnvelope);
                if (supportedInterfaces && supportedInterfaces['Alexa.Presentation.APL']) {
                    responseBuilder.addDirective({
                        type: 'Alexa.Presentation.APL.RenderDocument',
                        token: 'departureToken',
                        document: departureBoardDocument,
                        datasources: {
                            payload: {
                                departureData: {
                                    stationName: closestStop.commonName,
                                    lineName: next.lineName || 'Unknown',
                                    destination: next.destinationName || 'Unknown',
                                    time: timePhrase
                                }
                            }
                        }
                    });
                }
                                    
                return responseBuilder.speak(speakOutput).getResponse();
            } else {
                const noDataText = 'I found ' + closestStop.commonName + ' nearby, but there are no departures listed right now.';
                return responseBuilder.speak(noDataText).getResponse();
            }

        } catch (error) {
            console.error('Error details:', error);
            
            let errMsg = error.message;
            if (error.response && error.response.status) {
                const failUrl = error.config && error.config.url ? error.config.url : 'unknown URL';
                errMsg = 'Status ' + error.response.status + ' on link ' + failUrl;
            }
            
            return responseBuilder
                .speak('I crashed. The exact error is: ' + errMsg)
                .getResponse();
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
