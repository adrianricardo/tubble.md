# Git-default folder authority correction

Source: Adrian's 2026-07-15 direction in Codex.

The earlier move of repository brain data into Hubble Cloud was useful dogfood but was
unnecessary for this corpus. Cloud authority is needed when a folder requires realtime
collaboration or privacy/access boundaries separate from the repository; the Hubble
brain currently needs neither.

Requested outcomes:

1. Put the Hubble brain data back into Git.
2. Plan a clear UX that lets people selectively move folders from Git to Hubble Cloud
   and from Hubble Cloud back to Git.

Product interpretation adopted for the design pass: Git is the default for repository
content, every folder has one authority at a time, and moving a folder changes that
authority rather than creating two canonical copies. Cloud remains an explicit tool
for collaboration and repository-independent access—not a default prerequisite for
using Hubble.

Follow-up direction: stop at product/UX planning in this session. Do not implement the
feature, write its technical plan, modify product code, or run the app; a different,
cheaper model will take implementation later.
