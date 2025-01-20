function start() {
  // Check onStart function
  if (typeof onStart !== "function") {
    throw new Error(
      "onStart() function is missing - please check the documentation",
    );
  }

  // Remove all existing triggers to avoid parallel run
  ScriptApp.getProjectTriggers().forEach((trigger) =>
    ScriptApp.deleteTrigger(trigger),
  );

  // Remove any stop note from previous stop() call
  PropertiesService.getUserProperties().deleteProperty("stopNote");

  // Set the script invocation check to true
  onStart.calledByStartFunction = true;

  // Run the onStart function
  onStart();

  // Set the script invocation check to false
  onStart.calledByStartFunction = false;

  // Check stop note (if stop() was called during the script run)
  if (PropertiesService.getUserProperties().getProperty("stopNote") !== null) {
    Logger.log(`Synchronization stopped.`);
    return;
  }

  // Create a new time-based trigger for the start() function
  const minutes =
    typeof onStart.syncInterval === "number" ? onStart.syncInterval : 1;
  ScriptApp.newTrigger("start")
    .timeBased()
    .after(minutes * 60 * 1000)
    .create();
  Logger.log(
    `Synchronization will run again in approximately ${minutes} minute${minutes === 1 ? "" : "s"}`,
  );
}
