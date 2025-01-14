function onAirbusCalendarUpdate() {

  // - fix allday exdates
  // - fix allday time > date
  // - fix recreation events
  // - incremental sync
  // - calendar cleanup function
  // - doppelt 2 mai

  // - transfer to repo
  // - use repo google 2x; extend timeframe; adapt rules
  // - configure all triggers
  
  const daysToLastMonday = (new Date().getDay()) === 0 ? 6: (new Date().getDay()) - 1

  runOneWaySync('Airbus', 'AirbusToDennis', daysToLastMonday, 9999, (targetEvent, sourceEvent) => {

    // Cancel synchronized, declined, intraday out-of-office and transparent events
    if (isSynchronizedEvent(sourceEvent)) targetEvent.status = 'cancelled'
    if (isDeclinedByMe(sourceEvent)) targetEvent.status = 'cancelled'
    if (isOOOEvent(sourceEvent) && !isAlldayEvent(sourceEvent)) targetEvent.status = 'cancelled'
    if (sourceEvent.transparency === 'transparent') targetEvent.status = 'cancelled'
    
    // Keep summary, location and transparency
    targetEvent.summary = sourceEvent.summary
    targetEvent.location = sourceEvent.location
    targetEvent.transparency = sourceEvent.transparency

    // Add (?) for not yet accepted events
    if (isOpenByMe(sourceEvent) || isTentativeByMe(sourceEvent)) targetEvent.summary += ' (?)'

    // Show transparent events grey
    if (targetEvent.transparency) targetEvent.colorId = '8'

    // Return event
    return targetEvent

  })  

}
