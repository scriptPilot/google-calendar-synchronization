function removeMetaPropsFromEvent(event) {
  const {
    iCalUID,
    recurringEventId,
    sequence,
    id,
    updated,
    organizer,
    htmlLink,
    conferenceData,
    hangoutLink,
    reminders,
    etag,
    eventType,
    created,
    creator,
    kind,
    status,
    ...cleanEvent
  } = event;
  return cleanEvent;
}
