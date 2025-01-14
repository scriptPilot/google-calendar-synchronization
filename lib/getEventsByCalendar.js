// Returns event array by calendar resource
// https://developers.google.com/calendar/api/v3/reference/events#resource

function getEventsByCalendar({ calendar, timeMin, timeMax, sourceCalendarId }) {
  // Check input
  if (!calendar || typeof calendar.id !== "string")
    throw new Error("calendar.id should be a string");

  // Define options
  const options = {};
  if (timeMin) options.timeMin = timeMin.toISOString();
  if (timeMax) options.timeMax = timeMax.toISOString();
  if (sourceCalendarId) options.privateExtendedProperty = `sourceCalendarId=${sourceCalendarId}`

  // Retrieve events with pagination
  let events = [];
  let pageToken = null;
  while (pageToken !== undefined) {
    const { nextPageToken, items } = Calendar.Events.list(
      calendar.id,
      pageToken ? { ...options, pageToken } : { ...options },
    );
    events = [...events, ...items];
    pageToken = nextPageToken;
  }

  // Correct returned exdate prefix
  // - source events are not containing any exdate property
  // - target events are returning different format compared to the required input
  // - without correction, existing target events with exdate will be replaced on each sync run
  const exdateReturnedPrefix = "EXDATE;VALUE=DATE-TIME:";
  const exdateNewPrefix = `EXDATE;TZID=UTC:`;
  events = events.map((e) => ({
    ...e,
    ...(e.recurrence
      ? {
          recurrence: e.recurrence.map((r) =>
            r.replace(exdateReturnedPrefix, exdateNewPrefix),
          ),
        }
      : {}),
  }));

  // Add exdates to the event series
  // - source events are not containing any exdate property
  // - to create proper target events, the exdates are required in event series
  events = events.map((event) => {
    // Return any non-event-series unchanged
    if (!event.recurrence) return event;

    // Create array with exdates
    const exdates = [];

    // Filter events for instances of this event series
    const instances = events.filter((e) => e.recurringEventId === event.id);

    // Add instances to exdates array
    instances.forEach((instance) => {
      const instanceExdate = getRecurrenceRuleDateStr(
        instance.originalStartTime || instance.start,
      );
      exdates.push(instanceExdate);
    });

    // Add exdates to event
    if (exdates.length)
      event.recurrence.push(exdateNewPrefix + exdates.sort().join(","));

    // Retuen event
    return event;
  });

  // Sort recurrence array
  events = events.map((event) => ({
    ...event,
    ...(event.recurrence
      ? { recurrence: sortRecurrence(event.recurrence) }
      : {}),
  }));

  // Remove events with status cancelled
  // - cancelled events might not have all properties
  // - exdates added before to the event series
  events = events.filter((e) => e.status !== "cancelled");

  // Return events array
  return events;
}
