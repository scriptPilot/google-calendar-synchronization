function isSynchronizedEvent(event) {
  return event.extendedProperties?.private?.sourceCalendarId !== undefined
}

function isAlldayEvent(event) {
  const start = new Date(event.start.dateTime || event.start.date)
  const end = new Date(event.end.dateTime || event.end.date)
  return (end - start) % (24*60*60*1000) === 0
}

function isOOOEvent(event) {
  return event.eventType === 'outOfOffice'
}

function isBusyEvent(event) {
  return event.transparency !== 'transparent' && !isOOOEvent(event)
}

function isSynchronizedEvent(event) {
  return event.extendedProperties?.private?.sourceCalendarId !== undefined
}

function isRecurringEvent(event) {
  return event.recurringEventId !== undefined
}

function isDeclinedByMe(event) {
  return event.attendees?.filter(attendee => attendee.email === Session.getEffectiveUser().getEmail())[0]?.responseStatus === 'declined'
}

function isOpenOrTentativeByMe(event) {
  const responseStatus = event.attendees?.filter(attendee => attendee.email === Session.getEffectiveUser().getEmail())[0]?.responseStatus
  return responseStatus === 'needsAction' || responseStatus === 'tentative'
}

function isOnWeekend(event) {
  const startDate = new Date(event.start.dateTime || event.start.date)
  return startDate.getDay() === 6 || startDate.getDay() === 0
}