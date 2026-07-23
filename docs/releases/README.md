# Release Evidence

This directory stores public-safe release evidence for Reservas CRM releases and
prereleases.

Use the template and process in
[`../runbooks/release-evidence.md`](../runbooks/release-evidence.md).

Copy [`TEMPLATE.md`](TEMPLATE.md) for new evidence files.

Do not include secrets, private logs, raw tokens, customer data, private
installation identifiers, exploit details, or private business notes in release
evidence.

Evidence files are part of the public audit trail. Do not move published tags
to repair evidence mistakes. If evidence is incomplete, correct it in a
follow-up pull request. If source artifacts are wrong, publish a corrective
version.
