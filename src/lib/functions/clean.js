function clean() {
  // Log start
  Logger.log(`Cleanup started`);
  // Get saved sync pairs
  const syncPairs =
    PropertiesService.getUserProperties()
      .getProperty("syncPairs")
      ?.split(";") || [];

  // Loop sync pairs
  let totalExistingTargetEvents = 0;
  syncPairs.forEach((syncPair) => {
    // Extract calendar ids
    [sourceCalendarId, targetCalendarId] = syncPair.split(":");

    // Get relevant target events
    const existingTargetEvents = getEvents({
      calendarId: targetCalendarId,
      sourceCalendarId: sourceCalendarId,
    });

    // Delete relevant target events
    deleteEvents(targetCalendarId, existingTargetEvents);

    // Sum-up target event count
    totalExistingTargetEvents =
      totalExistingTargetEvents + existingTargetEvents.length;
  });

  // Reset all user properties
  PropertiesService.getUserProperties().deleteAllProperties();

  // Log completion
  Logger.log(
    `${totalExistingTargetEvents} obsolete target event${totalExistingTargetEvents !== 1 ? "s" : ""} deleted`,
  );
  Logger.log("User properties reset done");
  Logger.log("Cleanup completed");
  Logger.log("You can now remove the Google Apps Script project");
}
