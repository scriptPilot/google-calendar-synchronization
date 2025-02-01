function setMaxExecutionTime(minutes = 6) {
  // Check script invocation
  if (!onStart.calledByStartFunction) {
    throw new Error(
      "Please select the Code.gs file and run the start() script.",
    );
  }
  // Set the new max execution time
  onStart.maxExecutionTime = minutes;
}
