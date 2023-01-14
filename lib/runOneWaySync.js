// This function runs the synchronization itself
// It is not required to change this code
function runOneWaySync(sourceCalendarName, targetCalendarName, previousDays, nextDays, correctionFunction) {

  // Log synchronization start
  console.info(`Synchronization started from "${sourceCalendarName}" to "${targetCalendarName}".`)

  // Get source calendar by name
  let sourceCalendar = null
  Calendar.CalendarList.list().items.forEach(cal => {
    if (cal.summaryOverride === sourceCalendarName || cal.summary === sourceCalendarName) sourceCalendar = cal
  })
  if (!sourceCalendar) throw new Error(`Source calendar ${sourceCalendarName} not found.`)

  // Get target calendar by name
  let targetCalendar = null
  Calendar.CalendarList.list().items.forEach(cal => {
    if (cal.summaryOverride === targetCalendarName || cal.summary === targetCalendarName) targetCalendar = cal
  })
  if (!targetCalendar) throw new Error(`Target calendar ${targetCalendarName} not found.`)

  // Define start and end date
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1)
  const startDate = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() - previousDays)
  const endDate = new Date(todayEnd.getFullYear(), todayEnd.getMonth(), todayEnd.getDate() + nextDays)

  // Get last update from properties (if property is empty, lastUpdate is null)
  const lastUpdate = PropertiesService.getUserProperties().getProperty(sourceCalendar.id + '>' + targetCalendar.id)

  // Remember current time to save later as last update time
  const nextLastUpdate = new Date()

  // Get single source events
  // For period between start and end date
  // Exclude deleted events
  const sourceEvents = []
  let pageToken = null
  while (pageToken !== undefined) {
    const response = Calendar.Events.list(
      sourceCalendar.id,
      {
        pageToken,
        showDeleted: false,
        singleEvents: true,
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        updatedMin: lastUpdate
      }
    )
    sourceEvents.push(...response.items)
    pageToken = response.nextPageToken
  }

  // Get single existing target events
  // With matching source calendar attribute
  // Exlude deleted events
  const existingEvents = []
  pageToken = null
  while (pageToken !== undefined) {
    const response = Calendar.Events.list(
      targetCalendar.id,
      {
        pageToken,
        singleEvents: true,
        showDeleted: false,
        updatedMin: lastUpdate,
        privateExtendedProperty: `sourceCalendarId=${sourceCalendar.id}`
      }
    )
    existingEvents.push(...response.items)
    pageToken = response.nextPageToken
  }

  // Get existing events for updated source events
  sourceEvents.forEach(sourceEvent => {

    // Get events with matching private property source event id
    const existingEvent = Calendar.Events.list(
      targetCalendar.id,
      {
        singleEvents: true,
        showDeleted: false,
        privateExtendedProperty: `sourceCalendarId=${sourceCalendar.id}`,
        privateExtendedProperty: `sourceEventId=${sourceEvent.id}`
      }
    ).items[0]

    // If event found, add to the existing events array
    if (existingEvent) existingEvents.push(existingEvent)

  })

  // Get source events for updated existing events
  existingEvents.forEach(existingEvent => {

    // Get source event by id
    const sourceEvent = Calendar.Events.get(sourceCalendar.id, existingEvent.extendedProperties?.private?.sourceEventId)

    // If status not cancelled (not deleted), add to source events array
    if (sourceEvent?.status !== 'cancelled') sourceEvents.push(sourceEvent)

  })

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
      
      // Skip the target event if status === 'cancelled' (to be applied in the correction function)
      if (targetEvent.status === 'cancelled') {

        // Log skip
        console.info(`Skipped event "${targetEvent.summary}".`)

      // Create the target event
      } else {

        // Add the source calendar id and source event id as private property
        targetEvent.extendedProperties = {
          private: {
            sourceCalendarId: sourceCalendar.id,
            sourceEventId: sourceEvent.id
          }
        }

        // Create the event in Google Calendar
        const existingEvent = Calendar.Events.insert(targetEvent, targetCalendar.id)

        // Log creation
        console.info(`Created event "${targetEvent.summary}".`)

        // Add the target event to the target event array
        existingEvents.push(existingEvent)

      }

    // Event does already exists but target status === cancelled > delete
    } else if (targetEvent.status === 'cancelled') {

      // Delete event from Google Calendar
      Calendar.Events.remove(targetCalendar.id, existingEvent.id)

      // Log deletion
      console.info(`Deleted event "${existingEvent.summary}".`)

    // Event does already exist > compare
    } else {

      // Create a string from the target event
      const targetEventString = JSON.stringify(sortObject(targetEvent))

      // Create a harmonized string from the relevant existing event
      const harmonizedExistingEvent = {}
      Object.keys(targetEvent).forEach(key => harmonizedExistingEvent[key] = existingEvent[key])
      const harmonizedExistingEventString = JSON.stringify(sortObject(harmonizedExistingEvent))
      
      // Both strings are different > update event
      if (targetEventString !== harmonizedExistingEventString) {

        // Update existing event with target event values
        Object.keys(targetEvent).forEach(key => {
          existingEvent[key] = targetEvent[key]
        })

        // Update event in Google Calendar
        Calendar.Events.patch(existingEvent, targetCalendar.id, existingEvent.id)

        // Update existing events array
        for (let n = 0; n < existingEvents.length; n++) {
          if (existingEvents[n].id === existingEvent.id) {
            existingEvents[n] = existingEvent
          }
        }

        // Log update
        console.info(`Updated event "${targetEvent.summary}".`)

      }

    }
    
  })

  // Loop existing events
  existingEvents.forEach(existingEvent => {
    
    // Existing event not in source events > delete
    if (!sourceEvents.filter(sourceEvent => existingEvent.extendedProperties.private.sourceEventId === sourceEvent.id).length) {

      // Delete event from Google Calendar
      Calendar.Events.remove(targetCalendar.id, existingEvent.id)

      // Log deletion
      console.info(`Deleted event "${existingEvent.summary}".`)

    }

  })
  
  // Save last update to properties
  PropertiesService.getUserProperties().setProperty(sourceCalendar.id + '>' + targetCalendar.id, nextLastUpdate.toISOString())

  // Log synchronization end
  console.info('Synchronization completed.')
  
}