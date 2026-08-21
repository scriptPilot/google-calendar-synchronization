// Write exdate values back into a recurrence array (single sorted line)

function setExdates(recurrence, exdates) {
  if (!Array.isArray(recurrence)) return recurrence;
  recurrence = recurrence.filter((r) => r.substr(0, 6) !== "EXDATE");
  const uniqueSorted = [...new Set(exdates)].filter(Boolean).sort();
  if (uniqueSorted.length) recurrence.push(`EXDATE:${uniqueSorted.join(",")}`);
  return recurrence;
}
