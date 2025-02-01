function start() {
  // Check onStart function
  if (typeof onStart !== "function") {
    throw new Error(
      "onStart() function is missing - please check the documentation",
    );
  }

  // Set the script invocation check to true
  onStart.calledByStartFunction = true;

  // Set default values
  setSyncInterval();
  setMaxExecutionTime();

  // Create a trigger based on the max execution time (fallback if script is exeeding Google Script limits)
  createTrigger("start", onStart.maxExecutionTime);

  // Remove any stop note from previous stop() call
  PropertiesService.getUserProperties().deleteProperty("stopNote");

  // Wrap the sync to catch any error and ensure the next trigger creation
  try {
    // Run the onStart function
    onStart();
  } catch (err) {
    Logger.log("An error occured during the synchronization");
    Logger.log(`Message: ${err.message}`);
  }

  // Check stop note (if stop() was called during the script run)
  if (PropertiesService.getUserProperties().getProperty("stopNote") !== null) {
    Logger.log(`Synchronization stopped.`);
    return;
  }

  // Create a trigger based on the sync interval
  createTrigger("start", onStart.syncInterval);
}
