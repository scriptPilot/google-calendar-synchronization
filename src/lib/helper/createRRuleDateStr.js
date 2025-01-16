function createRRuleDateStr(dateTime) {
  if (dateTime.dateTime) {
    return dateTime.dateTime.substr(0, 19).replace(/(\.000)|(:)|(-)/g, "");
  } else {
    return dateTime.date.replace(/-/g, "");
  }
}
