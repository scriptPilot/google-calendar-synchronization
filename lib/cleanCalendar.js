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