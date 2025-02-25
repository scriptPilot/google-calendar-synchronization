function createTrigger(functionName, minutes) {
  deleteTrigger(functionName);
  if (typeof minutes === "number") {
    ScriptApp.newTrigger(functionName)
      .timeBased()
      .after(minutes * 60 * 1000)
      .create();
    Logger.log(
      `Trigger created for the ${functionName}() function in ${minutes} minute${minutes !== 1 ? "s" : ""}`,
    );
  } else if (minutes === "hourly") {
    ScriptApp.newTrigger(functionName).timeBased().everyHours(1).create();
    Logger.log(`Trigger created for the ${functionName}() function every hour`);
  } else {
    throw new Error("Minutes argument not valid");
  }
}
