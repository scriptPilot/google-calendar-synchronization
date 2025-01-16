function stop() {
  // Remove all existing triggers
  ScriptApp.getProjectTriggers().forEach((trigger) =>
    ScriptApp.deleteTrigger(trigger),
  );

  // Log script stop
  Logger.log(`The synchronization will not run again`);
  Logger.log(`If the script is currently running, it will complete`);
  Logger.log(`You might want to delete all synchronized events with clean()`);
}
