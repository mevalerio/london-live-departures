const { handler } = require('./index.js');
const event = {
    version: "1.0",
    request: {
        type: 'Alexa.Presentation.APL.UserEvent',
        arguments: ['RefreshWidget']
    },
    context: {
        System: {
            apiEndpoint: 'https://api.eu.amazonalexa.com',
            user: { userId: 'amzn1.ask.account.TEST' },
            device: { deviceId: 'amzn1.ask.device.TEST' }
        }
    }
};

handler(event, {}, (err, res) => {
    if (err) console.error("ERROR:", err);
    else console.log("SUCCESS:", JSON.stringify(res, null, 2));
});
