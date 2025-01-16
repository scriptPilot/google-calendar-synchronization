function correctUndefinedProps(event) {
  // Remove undefined props
  Object.keys(event).forEach((key) => {
    if (event[key] === undefined) delete event[key];
  });
  // Return event
  return event;
}
