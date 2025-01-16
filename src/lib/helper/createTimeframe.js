function createTimeframe(pastDays, nextDays) {
  // Calculate timeframe
  const today = new Date();
  const todayMorning = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const dateMin = new Date(
    todayMorning.getTime() - pastDays * 24 * 60 * 60 * 1000,
  );
  const dateMax = new Date(
    todayMorning.getTime() + (nextDays + 1) * 24 * 60 * 60 * 1000,
  );
  return { dateMin, dateMax };
}
