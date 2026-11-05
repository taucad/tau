---
revisions: minor
---

An opened path now jumps the large-object fill queue. `LargeObjectsReport.prioritize(paths)` asks the fill to fetch those paths' objects before the rest and to write each one as soon as it lands, even past a flush's byte bound. `ReadTreeOptions.firstLargeObjects` and `LfsDownloadManyInput.first` carry the order down to the transfer: the named objects go next, ahead of objects already answered and of batches not yet asked, behind only the transfers already in flight.
