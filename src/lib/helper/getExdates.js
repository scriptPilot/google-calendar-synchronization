// Extract exdate values from a recurrence array

function getExdates(recurrence) {
  if (!Array.isArray(recurrence)) return [];
  const exdateLine = recurrence.filter((r) => r.substr(0, 6) === "EXDATE")[0];
  if (!exdateLine) return [];
  return exdateLine.split(":")[1].split(",");
}
