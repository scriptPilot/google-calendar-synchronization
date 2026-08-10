function createBareEvent(event) {
  const keep = [
    "attachments",
    "attendees",
    "colorId",
    "description",
    "end",
    "extendedProperties",
    "location",
    "recurrence",
    "start",
    "summary",
    "transparency",
  ];
  const bareEvent = {};
  keep.forEach((k) => {
    if (event[k] !== undefined) bareEvent[k] = event[k];
  });
  return bareEvent;
}
