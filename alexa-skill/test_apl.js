const arrivals = [ { lineName: 'Jubilee', destinationName: 'Stratford', timeToStation: 120 } ];
let mappedArrivals = [];
for (let i = 0; i < arrivals.length; i++) {
    const next = arrivals[i];
    const minutes = Math.round(next.timeToStation / 60);
    let timePhrase = minutes === 0 ? 'Due' : minutes + ' min';
    
    mappedArrivals.push({
        line: next.lineName || 'Unknown',
        destination: next.destinationName || 'Unknown',
        time: timePhrase
    });
}
const payload = {
    widgetData: {
        stationName: "Westminster",
        arrivals: mappedArrivals
    }
};
console.log(JSON.stringify(payload, null, 2));
