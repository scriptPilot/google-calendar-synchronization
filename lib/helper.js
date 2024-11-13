function isSynchronizedEvent(event) {
  return event.extendedProperties?.private?.sourceCalendarId !== undefined
}

function isRecurringEvent(event) {
  return event.recurringEventId !== undefined
}

function isOOOEvent(event) {
  return event.eventType === 'outOfOffice'
}

function isAlldayEvent(event) {
  const start = new Date(event.start.dateTime || event.start.date)
  const end = new Date(event.end.dateTime || event.end.date)
  return (end - start) % (24*60*60*1000) === 0
}

function isOnWeekend(event) {
  const startDate = new Date(event.start.dateTime || event.start.date)
  return startDate.getDay() === 6 || startDate.getDay() === 0
}

function isBusyEvent(event) {
  return event.transparency !== 'transparent' && !isOOOEvent(event)
}

function isOpenByMe(event) {
  return event.attendees?.filter(attendee => attendee.email === Session.getEffectiveUser().getEmail())[0]?.responseStatus === 'needsAction'
}

function isAcceptedByMe(event) {
  return event.attendees?.filter(attendee => attendee.email === Session.getEffectiveUser().getEmail())[0]?.responseStatus === 'accepted'
}

function isDeclinedByMe(event) {
  return event.attendees?.filter(attendee => attendee.email === Session.getEffectiveUser().getEmail())[0]?.responseStatus === 'declined'
}