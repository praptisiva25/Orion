# Knowledge manifests

Store one YAML or JSON `SourceManifest` beside each approved document. The schema is `app/nba/schemas/manifest.py`. Initial demonstration rules use `illustrative_internal` references only; no official source has been downloaded or asserted.

Before publishing, calculate the SHA-256 hash from the exact source file, validate the manifest, verify any official URL and effective dates, and record an independent reviewer and approval date. `draft` and `in_review` sources must not be indexed. To retire a source, mark its manifest `retired`, retain its version for auditability, and rebuild the active index without it. Never edit an indexed document in place; publish a new version and preserve its source locators.
