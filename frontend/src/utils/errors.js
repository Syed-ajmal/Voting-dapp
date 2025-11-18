// Shared error helpers

/**
 * Detects whether an ethers.js error corresponds to the "Ballot not found"
 * revert in the SimpleVoting contract.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isBallotNotFoundError(err) {
  if (!err) return false;

  const parts = [];
  if (typeof err === "string") parts.push(err);

  parts.push(
    err?.reason,
    err?.message,
    err?.shortMessage,
    err?.error?.reason,
    err?.error?.message,
    err?.data?.message,
    err?.data?.data
  );

  const combined = parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return combined.includes("ballot not found");
}

