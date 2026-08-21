function sync(
  sourceCalendarName,
  targetCalendarName,
  pastDays = 7,
  nextDays = 28,
  correction = (targetEvent) => targetEvent,
) {
  // Check script invocation
  if (!onStart.calledByStartFunction) {
    throw new Error(
      "Please select the Code.gs file and run the start() script.",
    );
  }

  // Check options
  if (!sourceCalendarName) throw new Error("sourceCalendarName is missing");
  if (!targetCalendarName) throw new Error("targetCalendarName is missing");

  // Log start
  Logger.log(
    `Synchronization started from "${sourceCalendarName}" to "${targetCalendarName}"`,
  );

  // Get calendar details
  const sourceCalendar = getCalendar({ calendarName: sourceCalendarName });
  const targetCalendar = getCalendar({ calendarName: targetCalendarName });

  // Remember sync pair for later cleanup
  const syncPair = `${sourceCalendar.id}:${targetCalendar.id}`;
  const syncPairs =
    PropertiesService.getUserProperties()
      .getProperty("syncPairs")
      ?.split(";") || [];
  if (!syncPairs.includes(syncPair)) syncPairs.push(syncPair);
  PropertiesService.getUserProperties().setProperty(
    "syncPairs",
    syncPairs.join(";"),
  );

  // Calculate timeframe
  const { dateMin, dateMax } = createTimeframe(pastDays, nextDays);

  // Get source events
  let sourceEvents = getEvents({
    calendarId: sourceCalendar.id,
    dateMin,
    dateMax,
  });
  sourceEvents = correctExdates(sourceEvents, sourceCalendar.timeZone);
  sourceEvents = cutEventsSeries(
    sourceEvents,
    dateMin,
    dateMax,
    sourceCalendar.timeZone,
  );
  sourceEvents = cutSingleEvents(sourceEvents, dateMin, dateMax);
  Logger.log(
    `${sourceEvents.length} source event${sourceEvents.length !== 1 ? "s" : ""} found between ${createLocalDateStr(dateMin)} and ${createLocalDateStr(dateMax)}`,
  );

  // Get existing target events
  let existingTargetEvents = getEvents({
    calendarId: targetCalendar.id,
    sourceCalendarId: sourceCalendar.id,
  });
  existingTargetEvents = correctExdates(
    existingTargetEvents,
    targetCalendar.timeZone,
  );

  // Create target events
  const targetEvents = sourceEvents
    .map((sourceEvent) => {
      let targetEvent = createTargetEvent({ sourceEvent, sourceCalendar });
      targetEvent = correction(targetEvent, sourceEvent);
      targetEvent = correctUndefinedProps(targetEvent);
      return targetEvent;
    })
    .filter((e) => e.status !== "cancelled");

  // Calculate obsolete existing target events
  const obsoleteExistingTargetEvents = [];
  existingTargetEvents.forEach((existingTargetEvent) => {
    const targetEventFound = targetEvents.filter((e) =>
      isEventEqual(e, existingTargetEvent),
    ).length;
    const duplicatedExistingTargetEventFound = existingTargetEvents.filter(
      (e) =>
        isEventEqual(e, existingTargetEvent) && e.id < existingTargetEvent.id,
    ).length;
    if (!targetEventFound || duplicatedExistingTargetEventFound)
      obsoleteExistingTargetEvents.push(existingTargetEvent);
  });

  // Calculate missing target events
  const missingTargetEvents = targetEvents.filter((targetEvent) => {
    return !existingTargetEvents.filter((e) => isEventEqual(e, targetEvent))
      .length;
  });

  // Remove obsolete existing target events
  deleteEvents(targetCalendar.id, obsoleteExistingTargetEvents);

  // Create missing target events
  missingTargetEvents.forEach((targetEvent) => {
    Calendar.Events.insert(targetEvent, targetCalendar.id);
    Logger.log(
      `Created event "${targetEvent.summary || "(no title)"}" at ${createLocalDateStr(targetEvent.start)}`,
    );
  });

  // Log completion
  Logger.log(
    `${obsoleteExistingTargetEvents.length} obsolete target event${obsoleteExistingTargetEvents.length !== 1 ? "s" : ""} deleted`,
  );
  Logger.log(
    `${missingTargetEvents.length} missing target event${missingTargetEvents.length !== 1 ? "s" : ""} created`,
  );
  Logger.log("Synchronization completed");
}
