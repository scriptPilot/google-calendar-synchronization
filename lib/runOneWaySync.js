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
  const lastUpdate = PropertiesService.getUserProperties().getProperty(sourceCalendar.id)

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
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        updatedMin: lastUpdate
      }
    )
    sourceEvents.push(...response.items)
    pageToken = response.nextPageToken
  }

  // Get single target events
  // With matching source calendar attribute
  // Exlude deleted events
  const targetEvents = []
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
    targetEvents.push(...response.items)
    pageToken = response.nextPageToken
  }

  // Loop source events
  sourceEvents.forEach(sourceEvent => {

    // Event does not exist in target events > create    
    if (!targetEvents.map(event => event.extendedProperties?.private?.sourceEventId).includes(sourceEvent.id)) {
      // Create empty draft target event
      let targetEventDraft = {}   
      // Copy only some default attributes from the source event to avoid unintended data exposure
      // Addition attributes must be added in the correction function
      const defaultAttributes = ['summary', 'start', 'end', 'status']
      defaultAttributes.forEach(key => targetEventDraft[key] = sourceEvent[key])
      // Apply the correction function
      targetEventDraft = correctionFunction(targetEventDraft, sourceEvent)   
      // Add source calendar and source event ids as shared properties
      targetEventDraft.extendedProperties = {
        private: {
          sourceCalendarId: sourceCalendar.id,
          sourceEventId: sourceEvent.id
        }
      }
      // Skip the target event if status === 'cancelled' (can be done in the correction function)
      if (targetEventDraft.status === 'cancelled') {
        console.info(`Skipped event "${targetEventDraft.summary}".`)
      // Create the target event
      } else {
        // Create the event in Google Calendar
        const targetEvent = Calendar.Events.insert(targetEventDraft, targetCalendar.id)
        // Log creation
        console.info(`Created event "${targetEvent.summary}".`)
        // Add the target event to the target event array
        targetEvents.push(targetEvent)
      }
    }
    
  })
  
  // Save last update to properties
  // TODO: PropertiesService.getUserProperties().setProperty(sourceCalendar.id, nextLastUpdate.toISOString())

  // Log synchronization end
  console.info('Synchronization completed.')
  
}