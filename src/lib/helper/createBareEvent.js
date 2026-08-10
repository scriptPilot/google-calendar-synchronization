function createBareEvent(event) {
  const {
    anyoneCanAddSelf,
    conferenceData,
    created,
    creator,
    etag,
    eventType,
    guestsCanInviteOthers,
    guestsCanModify,
    guestsCanSeeOtherGuests,
    hangoutLink,
    htmlLink,
    iCalUID,
    id,
    kind,
    locked,
    organizer,
    originalStartTime,
    privateCopy,
    recurringEventId,
    reminders,
    sequence,
    source,
    status,
    transparency,
    updated,
    visibility,
    ...cleanEvent
  } = event;
  return cleanEvent;
}
