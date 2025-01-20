// Returns array with events resources
// https://developers.google.com/calendar/api/v3/reference/events#resource

function getEvents({ calendarId, dateMin, dateMax, sourceCalendarId }) {
  // Check the input
  if (!calendarId) throw new Error("calendarId is missing");

  // Define options
  const options = {
    maxResults: 2500,
    ...(dateMin ? { timeMin: dateMin.toISOString() } : {}),
    ...(dateMax ? { timeMax: dateMax.toISOString() } : {}),
    ...(sourceCalendarId
      ? { privateExtendedProperty: `sourceCalendarId=${sourceCalendarId}` }
      : {}),
  };

  // Retrieve all events with pagination
  let events = [];
  let pageToken = null;
  while (pageToken !== undefined) {
    const { nextPageToken, items } = Calendar.Events.list(
      calendarId,
      pageToken ? { ...options, pageToken } : { ...options },
    );
    events = [...events, ...items];
    pageToken = nextPageToken;
  }

  // Return the events array
  return events;
}
