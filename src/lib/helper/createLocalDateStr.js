function createLocalDateStr(dateTime) {
  // Create the date object
  let date;
  if (dateTime instanceof Date) date = new Date(dateTime.getTime());
  else if (typeof dateTime === "string") date = new Date(dateTime);
  else date = new Date(dateTime.dateTime || dateTime.date);
  // Format the date and time components
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  // Combine the components into the desired format
  const formattedDateStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  // Return formatted date string
  return formattedDateStr;
}
