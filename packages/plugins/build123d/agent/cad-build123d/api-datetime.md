# build123d — datetime

2 top-level symbols. Signatures are verbatim python.

// Category: datetime
// date(year, month, day) --> date object
date

  // Create a date from a POSIX timestamp
  // Remarks: The timestamp is a number, e.g. created via time.time(), that is interpreted as local time.
  // datetime.date.fromtimestamp (method)
  fromtimestamp(timestamp)

  // int -> date corresponding to a proleptic Gregorian ordinal
  fromordinal

  // str -> Construct a date from a string in ISO 8601 format
  // datetime.date.fromisoformat (method)
  fromisoformat(object)

  // int, int, int -> Construct a date from the ISO year, week number and weekday
  // Remarks: This is the inverse of the date.isocalendar() function
  fromisocalendar

  // Current date or datetime
  // datetime.date.today (method)
  today()

  // Return ctime() style string
  // datetime.date.ctime (method)
  ctime()

  // format -> strftime() style string
  strftime

  // Return time tuple, compatible with time.localtime()
  // datetime.date.timetuple (method)
  timetuple()

  // Return a named tuple containing ISO year, week number, and weekday
  // datetime.date.isocalendar (method)
  isocalendar()

  // Return string in ISO 8601 format, YYYY-MM-DD
  // datetime.date.isoformat (method)
  isoformat()

  // Return the day of the week represented by the date
  // Remarks: Monday == 1 ... Sunday == 7
  // datetime.date.isoweekday (method)
  isoweekday()

  // Return proleptic Gregorian ordinal
  // datetime.date.toordinal (method)
  toordinal()

  // Return the day of the week represented by the date
  // Remarks: Monday == 0 ... Sunday == 6
  // datetime.date.weekday (method)
  weekday()

  // Return date with new specified fields
  replace

// Category: datetime
// datetime(year, month, day[, hour[, minute[, second[, microsecond[,tzinfo]]]]])
// Remarks: The year, month and day arguments are required. tzinfo may be None, or an instance of a tzinfo subclass. The remaining arguments may be ints.
datetime

  // Returns new datetime object representing current time local to tz
  // Remarks: tz Timezone object. If no tz is specified, uses local timezone.
  // datetime.datetime.now (method)
  now(tz = None)

  // Return a new datetime representing UTC day and time
  // datetime.datetime.utcnow (method)
  utcnow()

  // timestamp[, tz] -> tz's local time from POSIX timestamp
  fromtimestamp

  // Construct a naive UTC datetime from a POSIX timestamp
  utcfromtimestamp

  // string, format -> new datetime parsed from a string (like time.strptime())
  strptime

  // date, time -> datetime with same date and time fields
  combine

  // string -> datetime from a string in most ISO 8601 formats
  // datetime.datetime.fromisoformat (method)
  fromisoformat(object)

  // Return date object with same year, month and day
  // datetime.datetime.date (method)
  date()

  // Return time object with same time but with tzinfo=None
  // datetime.datetime.time (method)
  time()

  // Return time object with same time and tzinfo
  // datetime.datetime.timetz (method)
  timetz()

  // Return ctime() style string
  // datetime.datetime.ctime (method)
  ctime()

  // Return time tuple, compatible with time.localtime()
  // datetime.datetime.timetuple (method)
  timetuple()

  // Return POSIX timestamp as float
  // datetime.datetime.timestamp (method)
  timestamp()

  // Return UTC time tuple, compatible with time.localtime()
  // datetime.datetime.utctimetuple (method)
  utctimetuple()

  // [sep] -> string in ISO 8601 format, YYYY-MM-DDT[HH[:MM[:SS[.mmm[uuu]]]]][+HH:MM]
  // Remarks: sep is used to separate the year from the time, and defaults to 'T'. The optional argument timespec specifies the number of additional terms of the time to include. Valid options are 'auto', 'hours', 'minutes', 'seconds', 'milliseconds' and 'microseconds'.
  isoformat

  // Return self.tzinfo.utcoffset(self)
  // datetime.datetime.utcoffset (method)
  utcoffset()

  // Return self.tzinfo.tzname(self)
  // datetime.datetime.tzname (method)
  tzname()

  // Return self.tzinfo.dst(self)
  // datetime.datetime.dst (method)
  dst()

  // Return datetime with new specified fields
  replace

  // tz -> convert to local time in new timezone tz
  astimezone
