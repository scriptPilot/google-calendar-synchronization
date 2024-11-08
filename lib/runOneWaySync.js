// This function runs the synchronization itself
function runOneWaySync(sourceCalendarName, targetCalendarName, previousDays, nextDays, correctionFunction) {

  // Log synchronization start
  console.info(`Synchronization started from "${sourceCalendarName}" to "${targetCalendarName}".`)

  // Define default arguments
  previousDays = previousDays || 7
  nextDays = nextDays || 21
  correctionFunction = correctionFunction || function(targetEvent) { return targetEvent }

  // Lock the script to avoid corrupt data (up to 30 Min)
  const lock = LockService.getUserLock()
  lock.waitLock(30*60*1000)

  // Function to sort an object by key recursively
  function sortObject(object) {
    if (typeof object !== 'object') return object
    const sortedObject = {}
    Object.keys(object).sort().forEach(key => {
      sortedObject[key] = sortObject(object[key])
    })
    return sortedObject
  }

  // Get source calendar by name
  let sourceCalendar = null
  Calendar.CalendarList.list({ showHidden: true }).items.forEach(cal => {
    if (cal.summaryOverride === sourceCalendarName || cal.summary === sourceCalendarName) sourceCalendar = cal
  })
  if (!sourceCalendar) throw new Error(`Source calendar ${sourceCalendarName} not found.`)

  // Get target calendar by name
  let targetCalendar = null
  Calendar.CalendarList.list({ showHidden: true }).items.forEach(cal => {
    if (cal.summaryOverride === targetCalendarName || cal.summary === targetCalendarName) targetCalendar = cal
  })
  if (!targetCalendar) throw new Error(`Target calendar ${targetCalendarName} not found.`)

  // Define start and end date
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1)
  const startDate = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() - previousDays)
  const endDate = new Date(todayEnd.getFullYear(), todayEnd.getMonth(), todayEnd.getDate() + nextDays)

  // Get last update from properties (if property is empty, last update will be 1970-01-01)
  const lastUpdateGiven = PropertiesService.getUserProperties().getProperty(sourceCalendar.id + '>' + targetCalendar.id)
  const lastUpdate = new Date(lastUpdateGiven)

  // Remember current time to save later as last update time
  const nextLastUpdate = new Date()
  
  // Get single source events
  // For period between start and end date
  // Exclude deleted events
  let sourceEvents = []
  let pageToken = null
  while (pageToken !== undefined) {
    const response = Calendar.Events.list(
      sourceCalendar.id,
      {
        pageToken,
        showDeleted: lastUpdateGiven ? true : false,
        singleEvents: true,
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        updatedMin: lastUpdateGiven ? lastUpdate.toISOString() : null
      }
    )
    sourceEvents.push(...response.items)
    pageToken = response.nextPageToken
  }

  // Get single existing target events
  // With matching source calendar attribute
  // Exlude deleted events
  let existingEvents = []
  pageToken = null
  while (pageToken !== undefined) {
    const response = Calendar.Events.list(
      targetCalendar.id,
      {
        pageToken,
        singleEvents: true,
        showDeleted: lastUpdateGiven ? true : false,
        updatedMin: lastUpdateGiven ? lastUpdate.toISOString() : null,
        privateExtendedProperty: `sourceCalendarId=${sourceCalendar.id}`
      }
    )
    existingEvents.push(...response.items)
    pageToken = response.nextPageToken
  }

  // If lastUpdateGiven, get existingEvents for updated sourceEvents
  if (lastUpdateGiven) {
    sourceEvents.forEach(sourceEvent => {
      if (!existingEvents.filter(event => event.extendedProperties?.private?.sourceEventId === sourceEvent.id).length) {
        existingEvents.push(...Calendar.Events.list(
          targetCalendar.id,
          {
            privateExtendedProperty: `sourceCalendarId=${sourceCalendar.id}`,
            privateExtendedProperty: `sourceEventId=${sourceEvent.id}`
          }
        ).items)
      }
    })
  }

  // If lastUpdateGiven, get sourceEvents for updated existingEvents
  if (lastUpdateGiven) {
    existingEvents.forEach(existingEvent => {
      if (!sourceEvents.filter(event => event.id === existingEvent.extendedProperties?.private?.sourceEventId).length) {
        const sourceEvent = Calendar.Events.get(sourceCalendar.id, existingEvent.extendedProperties?.private?.sourceEventId)
        if (sourceEvent) sourceEvents.push(sourceEvent)
      }
    })
  }

  // Loop source events
  sourceEvents.forEach(sourceEvent => {

    // Filter for relevant existing events
    const relevantExistingEvents = existingEvents.filter(event => event.extendedProperties?.private?.sourceEventId === sourceEvent.id)
    const existingEvent = relevantExistingEvents.length ? relevantExistingEvents[0] : null

    // Create to-be target event
    // Copy only some default attributes from the source event to avoid unintended data exposure
    // Addition attributes must be added in the correction function
    let targetEvent = {}
    const defaultAttributes = ['summary', 'start', 'end', 'status']
    defaultAttributes.forEach(key => targetEvent[key] = sourceEvent[key])
    
    // Apply the correction function
    targetEvent = correctionFunction(targetEvent, sourceEvent)  

    // Event does not exist in target events > create event  
    if (!existingEvent) {

      // Create the target event
      if (targetEvent.status !== 'cancelled') {

        // Add the source calendar id and source event id as private property
        targetEvent.extendedProperties = {
          private: {
            sourceCalendarId: sourceCalendar.id,
            sourceEventId: sourceEvent.id
          }
        }

        try {

          // Create the event in Google Calendar
          const existingEvent = Calendar.Events.insert(targetEvent, targetCalendar.id)

          // Log creation
          console.info(`Created event "${targetEvent.summary}".`)

        } catch (error) {

          // Log error
          console.error(`Failed to create event "${targetEvent.summary}".`)
          console.error(error)

        }

      }

    // Event does already exists but target status === cancelled > delete
    } else if (targetEvent.status === 'cancelled') {

      // Do not try to delete not existing events
      // Happens because deleted target events are considered as modifed in next run
      if (existingEvent?.status !== 'cancelled') {

        try {

          // Delete event from Google Calendar
          Calendar.Events.remove(targetCalendar.id, existingEvent.id)

          // Log deletion
          console.info(`Deleted event "${existingEvent.summary}".`)

        } catch (error) {

          // Log error
          console.error(`Failed to delete event "${existingEvent.summary}".`)
          console.error(error)

        }

      }

    // Event does already exist > compare
    } else {

      // Create a string from the target event
      const targetEventString = JSON.stringify(sortObject(targetEvent))

      // Create a harmonized string from the relevant existing event
      const harmonizedExistingEvent = {}
      Object.keys(targetEvent).forEach(key => harmonizedExistingEvent[key] = existingEvent[key])
      if (!harmonizedExistingEvent.colorId && targetEvent.colorId === '0') harmonizedExistingEvent.colorId = '0'
      const harmonizedExistingEventString = JSON.stringify(sortObject(harmonizedExistingEvent))
      
      // Both strings are different > update event
      if (targetEventString !== harmonizedExistingEventString) {

        // Update existing event with target event values
        Object.keys(targetEvent).forEach(key => {
          existingEvent[key] = targetEvent[key]
        })

        try {

          // Update event in Google Calendar
          Calendar.Events.patch(existingEvent, targetCalendar.id, existingEvent.id)

          // Log update
          const action = targetEvent.status === 'cancelled' ? 'Deleted' : 'Updated'
          console.info(`${action} event "${targetEvent.summary}".`)

        } catch (error) {

          // Log error
          console.error(`Failed to update event "${targetEvent.summary}".`)
          console.error(error)

        }

      }

    }
    
  })

  // Loop existing events
  existingEvents.forEach(existingEvent => {
    
    // Existing event not in source events > delete
    if (!sourceEvents.filter(sourceEvent => existingEvent.extendedProperties.private.sourceEventId === sourceEvent.id).length) {

      // Do not try to delete if existing event already deleted
      // Happens because deleted target events are considered as modifed in next run
      if (existingEvent.status !== 'cancelled') {

        try {

          // Delete event from Google Calendar
          Calendar.Events.remove(targetCalendar.id, existingEvent.id)

          // Log deletion
          console.info(`Deleted event "${existingEvent.summary}".`)

        } catch (error) {

          // Log error
          console.error(`Failed to delete event "${existingEvent.summary}".`)
          console.error(error)

        }

      }

    }

  })

  // Save last update to properties
  PropertiesService.getUserProperties().setProperty(sourceCalendar.id + '>' + targetCalendar.id, nextLastUpdate.toISOString())

  // Release the lock
  lock.releaseLock()

  // Log synchronization end
  console.info('Synchronization completed.')
  
}