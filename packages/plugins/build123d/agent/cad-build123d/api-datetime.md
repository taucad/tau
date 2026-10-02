# build123d — datetime

2 top-level symbols. Signatures are verbatim python.

// Category: datetime
// date(year, month, day) --> date object
date

  // Create a date from a POSIX timestamp
  // Remarks: The timestamp is a number, e.g. created via time.time(), that is interpreted as local time.
  fromtimestamp(timestamp)

  // int -> date corresponding to a proleptic Gregorian ordinal
  fromordinal

  // str -> Construct a date from a string in ISO 8601 format
  fromisoformat(object)

  // int, int, int -> Construct a date from the ISO year, week number and weekday
  // Remarks: This is the inverse of the date.isocalendar() function
  fromisocalendar

  // Current date or datetime
  today()

  // Return ctime() style string
  ctime()

  // format -> strftime() style string
  strftime

  // Return time tuple, compatible with time.localtime()
  timetuple()

  // Return a named tuple containing ISO year, week number, and weekday
  isocalendar()

  // Return string in ISO 8601 format, YYYY-MM-DD
  isoformat()

  // Return the day of the week represented by the date
  // Remarks: Monday == 1 ... Sunday == 7
  isoweekday()

  // Return proleptic Gregorian ordinal
  toordinal()

  // Return the day of the week represented by the date
  // Remarks: Monday == 0 ... Sunday == 6
  weekday()

  // Return date with new specified fields
  replace

// Category: datetime
// datetime(year, month, day[, hour[, minute[, second[, microsecond[,tzinfo]]]]])
// Remarks: The year, month and day arguments are required. tzinfo may be None, or an instance of a tzinfo subclass. The remaining arguments may be ints.
datetime

  // Returns new datetime object representing current time local to tz
  // Remarks: tz Timezone object. If no tz is specified, uses local timezone.
  now(tz = None)

  // Return a new datetime representing UTC day and time
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
  fromisoformat(object)

  // Return date object with same year, month and day
  date()

  // Return time object with same time but with tzinfo=None
  time()

  // Return time object with same time and tzinfo
  timetz()

  // Return ctime() style string
  ctime()

  // Return time tuple, compatible with time.localtime()
  timetuple()

  // Return POSIX timestamp as float
  timestamp()

  // Return UTC time tuple, compatible with time.localtime()
  utctimetuple()

  // [sep] -> string in ISO 8601 format, YYYY-MM-DDT[HH[:MM[:SS[.mmm[uuu]]]]][+HH:MM]
  // Remarks: sep is used to separate the year from the time, and defaults to 'T'. The optional argument timespec specifies the number of additional terms of the time to include. Valid options are 'auto', 'hours', 'minutes', 'seconds', 'milliseconds' and 'microseconds'.
  isoformat

  // Return self.tzinfo.utcoffset(self)
  utcoffset()

  // Return self.tzinfo.tzname(self)
  tzname()

  // Return self.tzinfo.dst(self)
  dst()

  // Return datetime with new specified fields
  replace

  // tz -> convert to local time in new timezone tz
  astimezone
