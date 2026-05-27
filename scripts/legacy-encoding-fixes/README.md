# Legacy encoding & UI fix scripts

These one-shot Python scripts were used during early Drama15 web work to repair
mojibake (CP1252 → UTF-8 round-trips), tweak CSS, and patch JSON state files.
None of them are part of the runtime — they were kept around in case a similar
encoding regression appears later.

If you want to run one, prefer running it from this directory so the relative
paths inside the scripts still resolve. Most expect the project root one
directory up.

Before publishing the repo publicly, audit each script for hard-coded paths,
test credentials, or sample data and remove anything sensitive.
