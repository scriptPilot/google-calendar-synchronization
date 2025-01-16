function isEventEqual(firstEvent, secondEvent) {
  firstEvent = JSON.stringify(createSortedEvent(createBareEvent(firstEvent)));
  secondEvent = JSON.stringify(createSortedEvent(createBareEvent(secondEvent)));
  return firstEvent === secondEvent;
}
