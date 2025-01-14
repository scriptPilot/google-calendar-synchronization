// This function deletes all synchronized events from a calendar
// Run this after the removal of calendars or other issues

function cleanCalendar(calendarName) {
  // Get calendar by name
  const calendar = getCalendarByName({ calendarName });
  if (!calendar) throw new Error(`Calendar "${calendarName}" not found`);

  // Get events
  const events = getEventsByCalendar({ calendar });

  // Loop events
  events.forEach((event) => {
    // Event is synchronized from another calendar
    if (isSynchronizedEvent(event)) {
      try {
        // Delete the event
        Calendar.Events.remove(calendar.id, event.id);

        // Log deletion
        console.info(`Deleted event "${event.summary}"`);
      } catch (error) {
        // Log error
        console.error(`Failed to delete event "${event.summary}"`);
        console.error(error);
      }
    }
  });
}
