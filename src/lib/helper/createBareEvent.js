function createBareEvent(event) {
  const {
    conferenceData,
    created,
    creator,
    etag,
    eventType,
    hangoutLink,
    htmlLink,
    iCalUID,
    id,
    kind,
    organizer,
    recurringEventId,
    reminders,
    sequence,
    status,
    updated,
    ...cleanEvent
  } = event;
  return cleanEvent;
}
