const { handler } = require('./index.js');
const event = {
    version: "1.0",
    request: {
        type: 'Alexa.Presentation.APL.UserEvent',
        arguments: ['RefreshWidget']
    },
    context: {
        // What if System is missing?
    }
};

handler(event, {}, (err, res) => {
    if (err) console.error("ERROR:", err);
    else console.log("SUCCESS:", JSON.stringify(res, null, 2));
});
