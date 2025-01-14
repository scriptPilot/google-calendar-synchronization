function eventsAreEqual(firstEvent, secondEvent) {
  firstEvent = removeMetaPropsFromEvent(firstEvent);
  firstEvent = JSON.stringify(sortObject(firstEvent));
  secondEvent = removeMetaPropsFromEvent(secondEvent);
  secondEvent = JSON.stringify(sortObject(secondEvent));
  return firstEvent === secondEvent;
}
