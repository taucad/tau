# Tau database source router

Select at most two sources. Stay on the listed official hosts and use only public read-only pages or documented anonymous endpoints.

| Intent                                     | Primary source                | Approved hosts                    | Return                                                            |
| ------------------------------------------ | ----------------------------- | --------------------------------- | ----------------------------------------------------------------- |
| Physical constants and material properties | NIST                          | `nist.gov`, `physics.nist.gov`    | Dataset/table identifier, value context, units, canonical page    |
| Patents and prior art                      | USPTO                         | `uspto.gov`, `ppubs.uspto.gov`    | Patent/application identifier, title, dates, official page        |
| Crystal structures                         | Crystallography Open Database | `crystallography.net`             | COD identifier and structure metadata; no structure-file download |
| Terrain, geology, earthquakes, and maps    | USGS                          | `usgs.gov`, `earthquake.usgs.gov` | Dataset/report/event identifier and official metadata page        |
| Aerospace and earth observation            | NASA                          | `nasa.gov`, `data.nasa.gov`       | Dataset/report/mission identifier and official page               |
| Weather, climate, and oceans               | NOAA                          | `noaa.gov`, `ncei.noaa.gov`       | Dataset/report/station identifier and official page               |

Reject redirects away from the approved official host family. If the relevant official interface requires an account, key, complex submitted query, or bulk export, report it as a coverage gap instead of improvising a fallback.
