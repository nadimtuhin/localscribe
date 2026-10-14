[00:00] Okay, let's get started. This is the weekly sync for the billing migration.
[00:07] First item: the invoice export is still timing out for accounts with more than ten thousand invoices.
[00:19] Priya, you said you profiled it last week. What did you find?
[00:24] The export loads every invoice into memory before writing the CSV. Streaming it should fix the timeout.
[00:41] Good. So we decide: switch the export to streaming. Priya owns it, target is next Friday.
[00:53] Second item: should we move to the new payment provider this quarter?
[01:02] I think it is too risky before the audit. The fee savings are real but small.
[01:15] Agreed. Decision: we postpone the provider switch until after the audit in November.
[01:28] Marcus, can you write up the fee comparison so we can revisit it then?
[01:34] Sure, I will share the comparison doc by the end of the month.
[01:46] One more thing, the staging database needs a backup before we run the migration script.
[01:55] I will do that tomorrow morning, says Dana. Also we should add an alert for failed exports.
[02:08] Good idea, but let's not scope that yet. Park it for the next sync.
[02:15] Alright, that's all. Thanks everyone.
