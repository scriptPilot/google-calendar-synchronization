function setSingleEvents(singleEvents = false) {
  // Check script invocation
  if (!onStart.calledByStartFunction) {
    throw new Error(
      "Please select the Code.gs file and run the start() script.",
    );
  }
  // Set the new single events option
  onStart.singleEvents = singleEvents;
}
