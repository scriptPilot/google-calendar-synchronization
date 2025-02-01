function deleteTrigger(functionName) {
  let triggers = ScriptApp.getProjectTriggers();
  for (let trigger of triggers) {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
      Logger.log(`Existing trigger deleted for the ${functionName}() function`);
    }
  }
}
