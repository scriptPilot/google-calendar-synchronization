function createBareEvent(event) {
  const keep = [
    "anyoneCanAddSelf",
    "attachments",
    "attendees",
    "colorId",
    "description",
    "end",
    "extendedProperties",
    "gadget",
    "guestsCanInviteOthers",
    "guestsCanModify",
    "guestsCanSeeOtherGuests",
    "location",
    "locked",
    "originalStartTime",
    "privateCopy",
    "recurrence",
    "reminders",
    "source",
    "start",
    "summary",
    "transparency",
    "visibility",
  ];
  const bareEvent = {};
  keep.forEach((k) => {
    if (event[k] !== undefined) bareEvent[k] = event[k];
  });
  return bareEvent;
}
