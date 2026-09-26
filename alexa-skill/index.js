const Alexa = require('ask-sdk-core');
const axios = require('axios');

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
            let address = await deviceAddressClient.getCountryAndPostalCode(deviceId);
            
            if (!address || !address.postalCode) {
                console.log('No address found. Falling back to SE1 8SW.');
                address = { postalCode: 'SE1 8SW' }; 
            }

            const safePostcode = encodeURIComponent(address.postalCode);
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
            const arrivalsUrl = 'https://api.tfl.gov.uk/StopPoint/' + closestStop.naptanId + '/Arrivals';
            const depRes = await axios.get(arrivalsUrl);
            const arrivals = depRes.data;

            if (arrivals && arrivals.length > 0) {
                arrivals.sort((a, b) => a.timeToStation - b.timeToStation);
                const next = arrivals[0];
                const minutes = Math.round(next.timeToStation / 60);
                
                let timePhrase = '';
                if (minutes === 0) {
                    timePhrase = 'is due now';
                } else {
                    timePhrase = 'will arrive in ' + minutes + ' minutes';
                }
                
                const speakOutput = 'At ' + closestStop.commonName + ', the next ' + next.lineName + ' towards ' + next.destinationName + ' ' + timePhrase + '.';
                                    
                return responseBuilder.speak(speakOutput).getResponse();
            } else {
                const noDataText = 'I found ' + closestStop.commonName + ' nearby, but there are no departures listed right now.';
                return responseBuilder.speak(noDataText).getResponse();
            }

        } catch (error) {
            console.error('Error details:', error);
            
            if (error.statusCode === 403 || error.name === 'ServiceError') {
                return responseBuilder
                    .speak('Please grant Location permissions in the Amazon Alexa app.')
                    .withAskForPermissionsConsentCard(['read::alexa:device:all:address:country_and_postal_code'])
                    .getResponse();
            }
            
            return responseBuilder
                .speak('Sorry, I had trouble checking the live boards. Please try again later.')
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
