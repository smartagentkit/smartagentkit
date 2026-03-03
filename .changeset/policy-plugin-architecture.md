---
"@smartagentkit/sdk": patch
"@smartagentkit/testing": patch
---

feat: add policy plugin architecture for extensible custom hooks

- Add `PolicyPlugin` interface, `pluginRegistry` singleton, and built-in plugins
- Refactor client internals to use registry instead of hardcoded switch statements
- Add `client.policies.install()`, `installRaw()`, and `list()` API
- Add `customModules` field to `ModuleAddresses` for custom hook addresses
- Update mock client to use SDK PRESETS directly
- Add 30 new plugin tests, custom policies guide, and policy-playground example
