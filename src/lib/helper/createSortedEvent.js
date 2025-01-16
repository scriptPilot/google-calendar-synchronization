function createSortedEvent(obj) {
  if (Array.isArray(obj)) return obj.sort();
  if (typeof obj === "object" && obj !== null) {
    const sortedObj = {};
    const sortedKeys = Object.keys(obj).sort();
    sortedKeys.forEach((key) => {
      sortedObj[key] = createSortedEvent(obj[key]);
    });
    return sortedObj;
  }
  return obj;
}
