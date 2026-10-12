const { handler } = require('./index.js');
const event = {
    version: "1.0",
    request: {
        type: 'IntentRequest',
        intent: { name: 'GetDeparturesIntent' }
    },
    context: {
        System: {
            device: { deviceId: 'amzn1.ask.device.TEST' },
            apiEndpoint: 'https://api.eu.amazonalexa.com',
            apiAccessToken: 'fake-token'
        }
    }
};

handler(event, {}, (err, res) => {
    if (err) console.error("ERROR:", err);
    else console.log("SUCCESS:", JSON.stringify(res, null, 2));
});
