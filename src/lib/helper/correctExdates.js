// Correction for retrieved Google Calendar events
// - add cancelled instances as exdate to the main event
// - remove cancelled instances from the events array

function correctExdates(events, calendarTimeZone) {
  // Load DateTime
  const DateTime = loadDateTime();

  // Add missing exdates
  events = events.map((event) => {
    // Return any non-event-series unchanged
    if (!event.recurrence) return event;

    // Create array with exdates; keep existing ones
    const existingExdates = event.recurrence.filter(
      (r) => r.substr(0, 6) === "EXDATE",
    )[0];
    const exdates = existingExdates
      ? existingExdates.split(":")[1].split(",")
      : [];

    // Filter events for instances of this event series
    const instances = events.filter((e) => e.recurringEventId === event.id);

    // Add instances to the exdates array
    instances.forEach((instance) => {
      const instanceExdate = DateTime.fromISO(
        instance.originalStartTime.dateTime || instance.originalStartTime.date,
        { zone: instance.originalStartTime.timeZone || calendarTimeZone },
      );
      exdates.push(
        instance.originalStartTime.dateTime
          ? instanceExdate.toFormat("yMMdd'T'HHmmss")
          : instanceExdate.toFormat("yMMdd"),
      );
    });

    // Add exdates to the event
    if (exdates.length) {
      event.recurrence = event.recurrence.filter(
        (r) => r.substr(0, 6) !== "EXDATE",
      );
      event.recurrence.push(`EXDATE:${exdates.sort().join(",")}`);
    }

    // Return the event
    return event;
  });

  // Remove cancelled instances (listed in exdates)
  events = events.filter(
    (e) => !(e.recurringEventId && e.status === "cancelled"),
  );

  // Return corrected events
  return events;
}
