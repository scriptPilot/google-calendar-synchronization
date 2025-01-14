function runOneWaySync(
  sourceCalendarName,
  targetCalendarName,
  previousDays = 7,
  nextDays = 21,
  correctionFunction = (targetEvent) => targetEvent,
) {
  // Get calendar details
  const sourceCalendar = getCalendarByName({
    calendarName: sourceCalendarName,
  });
  const targetCalendar = getCalendarByName({
    calendarName: targetCalendarName,
  });

  // Log start
  Logger.log(
    `Synchronization started from "${sourceCalendar.summary}" to "${targetCalendar.summary}"`,
  );

  // Calculate min and max time
  const today = new Date();
  const timeMin = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - previousDays,
    0,
    0,
    0,
  );
  const timeMax = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + nextDays,
    23,
    59,
    59,
  );

  // Get source events and cut recurring events
  let sourceEvents = getEventsByCalendar({
    calendar: sourceCalendar,
    timeMin,
    timeMax,
  });
  sourceEvents = cutRecurringEvents(
    sourceCalendar,
    sourceEvents,
    timeMin,
    timeMax,
  );

  // Get existing target events
  const existingTargetEvents = getEventsByCalendar({
    calendar: targetCalendar,
    sourceCalendarId: sourceCalendar.id
  });

  // Calculate target events, apply correction function
  let targetEvents = sourceEvents
    .map((sourceEvent) =>
      correctionFunction(createTargetEvent(sourceEvent), sourceEvent),
    )
    .filter((e) => e.status !== "cancelled");

  // Remove undefined properties from target event
  targetEvents = targetEvents.map((event) => {
    Object.keys(event).forEach((key) => {
      if (event[key] === undefined) delete event[key];
    });
    return event;
  });

  // Calculate obsolete target events
  const obsoleteExistingTargetEvents = [];
  existingTargetEvents.forEach((existingTargetEvent) => {
    const targetEventFound = targetEvents.filter((e) =>
      eventsAreEqual(e, existingTargetEvent),
    ).length;
    const duplicatedExistingTargetEventFound = existingTargetEvents.filter(
      (e) =>
        eventsAreEqual(e, existingTargetEvent) && e.id < existingTargetEvent.id,
    ).length;
    if (!targetEventFound || duplicatedExistingTargetEventFound)
      obsoleteExistingTargetEvents.push(existingTargetEvent);
  });

  // Calculate missing target events
  const missingTargetEvents = [];
  targetEvents.forEach((targetEvent) => {
    const existingTargetEventFound = existingTargetEvents.filter(
      (existingEvent) => eventsAreEqual(targetEvent, existingEvent),
    ).length;
    if (!existingTargetEventFound) missingTargetEvents.push(targetEvent);
  });

  // Remove obsolete existing target events
  obsoleteExistingTargetEvents.forEach((existingTargetEvent) => {
    Calendar.Events.remove(targetCalendar.id, existingTargetEvent.id);
    const startStr = getUTCDateTimeStr(existingTargetEvent.start);
    Logger.log(
      `Deleted event "${existingTargetEvent.summary || "(no title)"}" at ${startStr}`,
    );
  });

  // Create missing target events
  missingTargetEvents.forEach((targetEvent) => {
    Calendar.Events.insert(targetEvent, targetCalendar.id);
    const startStr = getUTCDateTimeStr(targetEvent.start || targetEvent.start);
    Logger.log(
      `Created event "${targetEvent.summary || "(no title)"}" at ${startStr}`,
    );
  });

  // Log completion
  const timeMinStr = timeMin.toLocaleString("en-CA").substr(0, 10);
  const timeMaxStr = timeMax.toLocaleString("en-CA").substr(0, 10);
  Logger.log(
    `${sourceEvents.length} source event${sourceEvents.length !== 1 ? "s" : ""} found between ${timeMinStr} and ${timeMaxStr}`,
  );
  Logger.log(
    `${obsoleteExistingTargetEvents.length} obsolete target event${obsoleteExistingTargetEvents.length !== 1 ? "s" : ""} deleted`,
  );
  Logger.log(
    `${missingTargetEvents.length} missing target event${missingTargetEvents.length !== 1 ? "s" : ""} created`,
  );
  Logger.log("Synchronization completed");
}
