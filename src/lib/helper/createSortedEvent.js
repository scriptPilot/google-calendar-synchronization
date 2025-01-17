function createSortedEvent(obj) {
  if (Array.isArray(obj)) return obj.sort();
  if (typeof obj === "object" && obj !== null) {
    const sortedObj = {};
    const sortedKeys = Object.keys(obj).sort();
    sortedKeys.forEach((key) => {
      // Harmonize dateTime string
      if (key === 'dateTime') {
        sortedObj[key] = new Date(obj[key]).toISOString()
      // Sort rrule elements properly
      } else if (key === 'recurrence') {
        sortedObj[key] = obj[key].map(el => {
          let [ elKey, elValue ] = el.split(':')
          elValue = elValue.split(';').sort().join(';')
          return [ elKey, elValue ].join(':')
        })
      // Any other property
      } else {
        sortedObj[key] = createSortedEvent(obj[key]);
      }
    });
    return sortedObj;
  }
  return obj;
}
