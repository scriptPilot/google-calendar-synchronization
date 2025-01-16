// Returns calendar resource
// https://developers.google.com/calendar/api/v3/reference/calendarList#resource

function getCalendar({ calendarName }) {
  // Check input
  if (typeof calendarName !== "string")
    throw new Error("calendarName should be a string");

  // Retrieve and filter calendar list
  const calendarList = Calendar.CalendarList.list({ showHidden: true }).items;
  const filteredList = calendarList.filter((c) => c.summary === calendarName);

  // Throw error if no calendar is found
  if (filteredList.length < 1)
    throw new Error(`Calendar "${calendarName}" not found`);

  // Throw error if multiple calendar are found
  if (filteredList.length > 1)
    throw new Error(`Multiple calendar found for name "${calendarName}"`);

  // Return calendar resource
  const calendar = filteredList[0];
  return calendar;
}
