# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added 

- `String` literals and variables
- `Int.toString()` and `Int.toFloatString()`
- `StringBuilder` for gas-efficient string building
- Global compile-time `ton` function that conversts string to Int during compile time.
- `checkDataSignature` similar to func `check_data_signature`
- `String.asComment` for conversion text to a comment payload
- `Resumable` trait, allows to resume contract operations once it was stopped
- Comment receiver that allows to receive arbitrary comment
- `String.asSlice` cast string to a slice for parsing
- Binary shift operators `>>` and `<<`
- `Slice.fromBase64` that converts text slice that has base64 to binary representation (both classic and url)
- `Slice.asCell`, `Builder.asCell`, `Cell.asSlice`, `Builder.asCell` convenience functions
- `Slice.loadCoins` that reads coins from slice
- `myBalance` that returns current balance of a contract before execution phase

### Changed
- `contractAddress` now accepts single argument of type `StateInit` and always produces address for workchain. Old method is renamed to `contractAddressExt`.
- `hashCell` and `hashSlice` are now extension function `hash` on `Slice` and `Cell`
- Removed some keywords such as `message`, `contract`, `init` to allow use this names as variable names
- Renamed `receiveBounced` to `bounced`

### Fixed

- Fixing importing tact with providing extension, now `import "./lib";` and `import "./lib.tact";` are equivalent.
- Fixing extension function generation
- Fixing clashing of variable names with func primitives and global functions
- Fix fallback and bounce argument type resolving
- Fixed `loadUint`/`preloadUint`
- Fixed invalid generation of `>=` and `>` operators