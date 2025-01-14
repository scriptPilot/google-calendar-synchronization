function getRecurrenceRuleDateStr(dateTimeObj) {
  return getUTCDateTimeStr(dateTimeObj).replace(/(\.000)|(:)|(-)/g, "");
}
