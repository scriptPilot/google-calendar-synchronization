// This function deletes all synchronized events from a calendar
// Run this after the removal of calendars or other issues
function cleanCalendar(calendarName) {
  
  // Get source calendar by name
  let calendar = null
  Calendar.CalendarList.list().items.forEach(cal => {
    if (cal.summaryOverride === calendarName || cal.summary === calendarName) calendar = cal
  })
  if (!calendar) throw new Error(`Source calendar ${calendarName} not found.`)  

  // List all events
  let events = []
  let pageToken = null
  while (pageToken !== undefined) {
    const response = Calendar.Events.list(
      calendar.id,
      {
        pageToken,
        showDeleted: false,
        singleEvents: false
      }
    )
    events.push(...response.items)
    pageToken = response.nextPageToken
  }

  // Loop events
  events.forEach(event => {

    // Event is synchronized from another calendar
    if (event.extendedProperties?.private?.sourceCalendarId) {

      try {
        
        // Delete the event
        Calendar.Events.remove(calendar.id, event.id)

        // Log deletion
        console.info(`Deleted event "${event.summary}".`)

      } catch (error) {

        // Log error
        console.error(`Failed to delete event "${event.summary}".`)
        console.error(error)

      }

    }

  })

}

function timeBlockingCorrection(targetEvent, sourceEvent) {

  // Return if no start or end date
  if (!sourceEvent.start || !sourceEvent.end) return { ...targetEvent, status: 'cancelled' }

  // Get event start and end date
  const targetEventStart = new Date (targetEvent.start.dateTime || targetEvent.start.date)
  const targetEventEnd = new Date (targetEvent.end.dateTime || targetEvent.end.date)

  // Exclude weekend
  if (targetEventStart.getDay() === 0 || targetEventStart.getDay() === 6 || targetEventEnd.getDay() === 0 || targetEventEnd.getDay() === 6) {
    targetEvent.status = 'cancelled'
  }

  // Exclude times outside my working hours
  if (sourceEvent.start.dateTime && sourceEvent.end.dateTime) {
    const workStart = 6
    const workEnd = 16

    // Events entirely before or after my working hours
    if (targetEventEnd.getHours() < workStart || targetEventStart.getHours() >= workEnd) {
      targetEvent.status = 'cancelled'

    // Events within my working hours
    } else {
      if (targetEventStart.getHours() < workStart) {
        targetEventStart.setHours(workStart)
        targetEventStart.setMinutes(0)
        targetEvent.start.dateTime = targetEventStart.toISOString()
      } 
      if (targetEventEnd.getHours() >= workEnd) {
        targetEventEnd.setHours(workEnd)
        targetEventEnd.setMinutes(0)
        targetEvent.end.dateTime = targetEventEnd.toISOString()
      } 
    }
  }

  // Exclude absent days
  // TODO

  // Exclude informations
  if (sourceEvent.transparency === 'transparent') targetEvent.status = 'cancelled'

  // Set summary to "Busy"
  targetEvent.summary = 'Busy'

  // Set default calendar event color
  targetEvent.colorId = '0'

  // Return target event
  return targetEvent

}

function onTermineCalendarUpdate() {
  runOneWaySync('Termine', 'Time Blocking', 7, 28, timeBlockingCorrection)
  runOneWaySync('Termine', 'Dennis Monat', 28, 365, targetEvent => {
    
    // set default color
    targetEvent.colorId = '0'

    // return target event
    return targetEvent

  })
}
function onPlanungCalendarUpdate() {
  runOneWaySync('Planung', 'Time Blocking', 7, 28, timeBlockingCorrection)
  runOneWaySync('Planung', 'Dennis Woche', 7, 28, (targetEvent, sourceEvent) => {

    // Exlude free events
    if (sourceEvent.transparency === 'transparent') targetEvent.status = 'cancelled'

    // set default color
    targetEvent.colorId = '0'

    // Return target event
    return targetEvent    

  })
}
function onFamilieCalendarUpdate() {
  runOneWaySync('Familie', 'Time Blocking', 7, 28, timeBlockingCorrection)
}
function onMeetingsCalendarUpdate() {
  runOneWaySync('Meetings', 'Dennis Monat', 28, 365, (targetEvent, sourceEvent) => {

    // Exclude others than allday events
    if (!sourceEvent.start?.date || !sourceEvent.end?.date) targetEvent.status = 'cancelled'

    // set default color
    targetEvent.colorId = '0'

    // Return target event
    return targetEvent

  })
  runOneWaySync('Meetings', 'Dennis Woche', 7, 28, (targetEvent, sourceEvent) => {

    // Exclude allday events
    if (sourceEvent.start?.date || sourceEvent.end?.date) targetEvent.status = 'cancelled'

    // set default color
    targetEvent.colorId = '0'

    // Return target event
    return targetEvent    

  })
}
function onAbsencesCalendarUpdate() {
  runOneWaySync('Absences', 'Dennis Monat', 28, 365, targetEvent => targetEvent)
}

// This function runs the synchronization itself
function runOneWaySync(sourceCalendarName, targetCalendarName, previousDays, nextDays, correctionFunction) {

  // Log synchronization start
  console.info(`Synchronization started from "${sourceCalendarName}" to "${targetCalendarName}".`)

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
        showDeleted: false,
        singleEvents: true,
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString()
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
        showDeleted: false,
        privateExtendedProperty: `sourceCalendarId=${sourceCalendar.id}`
      }
    )
    existingEvents.push(...response.items)
    pageToken = response.nextPageToken
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

  })

  // Release the lock
  lock.releaseLock()

  // Log synchronization end
  console.info('Synchronization completed.')
  
}