function getUTCDateTimeStr(dateTimeObject) {
  if (dateTimeObject.dateTime) {
    return new Date(dateTimeObject.dateTime).toISOString();
  } else {
    const date = new Date(dateTimeObject.date);
    date.setTime(date.getTime() + date.getTimezoneOffset() * 60 * 1000);
    return date.toISOString();
  }
}
