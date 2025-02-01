function createTrigger(functionName, minutes) {
  deleteTrigger(functionName);
  ScriptApp.newTrigger(functionName)
    .timeBased()
    .after(minutes * 60 * 1000)
    .create();
  Logger.log(
    `Trigger created for the ${functionName}() function in ${minutes} minute${minutes !== 1 ? "s" : ""}`,
  );
}
