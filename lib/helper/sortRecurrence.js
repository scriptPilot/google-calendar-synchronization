function sortRecurrence(recArr) {
  return recArr
    .map((recItem) => {
      [recKey, recValue] = recItem.split(":");
      recValue = recValue.split(";").sort().join(";");
      return [recKey, recValue].join(":");
    })
    .sort();
}
