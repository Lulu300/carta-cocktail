---
version: 1.5.0
date: 2026-10-20
breaking: false
required_actions:
  - when: before        # before | after
    action: "Add JWT_SECRET (at least 32 characters) to .env."
  - when: after
    action: "If the admin password is still admin123, change it in Settings > Admin Profile."
---

<!--
How to use this template (remove this comment in the real file):

- Copy it to docs/releases/vX.Y.Z.md. The release workflow refuses a tag
  without its notes file, and checks that the front matter version matches
  the file name.
- A pre-release vX.Y.Z-rc.N uses docs/releases/vX.Y.Z.md. Write
  docs/releases/vX.Y.Z-rc.N.md (with version: X.Y.Z-rc.N) only when the
  pre-release must say something else.
- Front matter, read by machines (in-app upgrade guide):
  - version: without the leading v
  - date: ISO date of the release
  - breaking: true when an existing instance needs an action, or may refuse
    to start, after the upgrade
  - required_actions: ordered list of { when: before | after, action: "..." },
    or [] when there is nothing to do
- "Required actions" below is the readable copy: same actions, same order,
  with details and commands. Write "None." when the list is empty.
- Copy every required action into UPGRADING.md as well.
- When an action names the version (compose file URL on the vX.Y.Z tag,
  :X.Y.Z image pin), add a "Testing a pre-release" line: these only exist
  after the final release, so testers use vX.Y.Z-rc.N and :X.Y.Z-rc.N.
- The workflow appends the pull request list and the docker pull commands:
  do not write them here.
-->

## Summary

One or two sentences for the user.

<!-- Breaking release: recommend pinning the images to :<version>
     (or :<major>.<minor> once D-05 publishes that tag) instead of :latest. -->

## Changes

Detailed changelog, grouped by area (public menu, admin, backend, Docker).

## Required actions

### Before upgrading

1. ...

### After upgrading

1. ...
