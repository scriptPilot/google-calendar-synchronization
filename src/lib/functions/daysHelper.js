function pastDays(dateTime) {
  const duration = DateTimeInterval.fromDateTimes(dateTime, DateTime.now());
  return Math.floor(duration.length("days"));
}

function nextDays(dateTime) {
  const duration = DateTimeInterval.fromDateTimes(DateTime.now(), dateTime);
  return Math.floor(duration.length("days"));
}

function startOfWeek(offset = 0) {
  return pastDays(DateTime.now().startOf("week").minus({ weeks: offset }));
}

function endOfWeek(offset = 0) {
  return nextDays(DateTime.now().endOf("week").plus({ weeks: offset }));
}

function startOfMonth(offset = 0) {
  return pastDays(DateTime.now().startOf("month").minus({ months: offset }));
}

function endOfMonth(offset = 0) {
  return nextDays(
    DateTime.now().startOf("month").plus({ months: offset }).endOf("month"),
  );
}

function startOfQuarter(offset = 0) {
  const now = DateTime.now();
  const monthsToStartOfQuarter = (now.month - 1) % 3;
  return pastDays(
    now
      .startOf("month")
      .minus({ months: monthsToStartOfQuarter })
      .minus({ months: offset * 3 }),
  );
}

function endOfQuarter(offset = 0) {
  const now = DateTime.now();
  const monthsToEndOfQuarter = Math.ceil(now.month / 3) * 3 - now.month;
  return nextDays(
    now
      .startOf("month")
      .plus({ months: monthsToEndOfQuarter })
      .plus({ months: offset * 3 })
      .endOf("month"),
  );
}

function startOfHalfyear(offset = 0) {
  const now = DateTime.now();
  const monthsToStartOfHalfyear = (now.month - 1) % 6;
  return pastDays(
    now
      .startOf("month")
      .minus({ months: monthsToStartOfHalfyear })
      .minus({ months: offset * 6 }),
  );
}

function endOfHalfyear(offset = 0) {
  const now = DateTime.now();
  const monthsToEndOfHalfyear = Math.ceil(now.month / 6) * 6 - now.month;
  return nextDays(
    now
      .startOf("month")
      .plus({ months: monthsToEndOfHalfyear })
      .plus({ months: offset * 6 })
      .endOf("month"),
  );
}

function startOfYear(offset = 0) {
  return nextDays(DateTime.now().startOf("year").plus({ years: offset }));
}

function endOfYear(offset = 0) {
  return nextDays(
    DateTime.now().startOf("year").plus({ years: offset }).endOf("year"),
  );
}
