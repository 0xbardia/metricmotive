# References

Checked 2026-09-12.

| Source | Version / tag | Informed |
| --- | --- | --- |
| https://docs.genlayer.com/developers/intelligent-contracts/first-contract | Depends `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` | Contract runner header, `gl.Contract`, view/write |
| https://docs.genlayer.com/developers/intelligent-contracts/features/storage | current | DynArray, TreeMap, `@allow_storage`, `copy_to_memory`, no `int` persistence |
| https://docs.genlayer.com/developers/intelligent-contracts/features/non-determinism | current | `gl.nondet.exec_prompt`, `gl.vm.run_nondet_unsafe` |
| https://docs.genlayer.com/developers/intelligent-contracts/features/calling-llms | current | `response_format="json"`, independent validator pattern |
| https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle | current | Compare decision fields, not prose |
| https://docs.genlayer.com/developers/intelligent-contracts/features/transaction-context | current | `gl.message.sender_address` |
| https://docs.genlayer.com/developers/networks | current | Studionet chain ID 61999, RPC `https://studio.genlayer.com/api` |
| https://studio.genlayer.com/contracts | Studionet 2026-09-12 | Deploy `0x9Fa308c399fA8c1566B4Da1e76825eAFC04d8d7C`, all 11 read methods PASS |
| `OFFCHAIN_AI_BASE_URL` (default `https://api.x.ai/v1`) | `OFFCHAIN_AI_MODEL` | Server-side advisory intelligence only |
