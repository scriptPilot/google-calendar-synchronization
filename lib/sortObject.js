// Function to sort an object by key recursively
// It is not required to change this code
function sortObject(object) {
  if (typeof object !== 'object') return object
  const sortedObject = {}
  Object.keys(object).sort().forEach(key => {
    sortedObject[key] = sortObject(object[key])
  })
  return sortedObject
}
