function deleteTrigger(functionName, exclude = null) {
  let triggers = ScriptApp.getProjectTriggers();
  for (let trigger of triggers) {
    if (
      trigger.getHandlerFunction() === functionName &&
      trigger.getUniqueId() !== exclude
    ) {
      ScriptApp.deleteTrigger(trigger);
      Logger.log(`Existing trigger deleted for the ${functionName}() function`);
    }
  }
}
