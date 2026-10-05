/**
 * Consolidated LedgerService shim.
 * Re-exports the authoritative modular LedgerService and types from ./ledger/
 * ensuring backward compatibility for legacy imports without duplicate logic.
 */
export * from "./ledger/ledger.service";
export * from "./ledger/ledger.types";
