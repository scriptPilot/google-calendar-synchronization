function createTrigger(functionName, minutes) {
  deleteTrigger(functionName);
  if (functionName === "startFallback") {
    // Ceil to next valid interval (1, 5, 10, 15 or 30)
    minutes =
      minutes >= 30
        ? minutes
        : minutes > 15
          ? 30
          : minutes > 10
            ? 15
            : minutes > 5
              ? 10
              : 5;
    if (minutes <= 30) {
      ScriptApp.newTrigger(functionName)
        .timeBased()
        .everyMinutes(minutes)
        .create();
    } else {
      ScriptApp.newTrigger(functionName).timeBased().everyHours(1).create();
    }
  } else {
    ScriptApp.newTrigger(functionName)
      .timeBased()
      .after(minutes * 60 * 1000)
      .create();
  }
  Logger.log(
    `Trigger created for the ${functionName}() function ${functionName === "startFallback" ? "every" : "in"} ${minutes} minute${minutes !== 1 ? "s" : ""}`,
  );
}
