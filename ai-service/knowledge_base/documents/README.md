# Knowledge documents

This directory holds versioned source documents prepared for NBA review. Downloaded files are ignored by Git by default. Batch 2 has RBI source manifests, but no source is approved for retrieval and no FAISS index is built. Add a document only after checking its canonical publisher, jurisdiction, version, effective dates, current status, usage rights, and relevance. Do not add customer records, ticket exports, credentials, or other sensitive banking data.

Keep source files immutable after review. A changed source is a new version with a new content hash and review record; do not silently replace content already referenced by an index. Use `OfficialDocumentFetcher` only with its configured RBI host allowlist for the reviewed public source list.
