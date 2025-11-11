// src/components/Footer.jsx
import React from "react";

/**
 * Footer Component
 * Simple, unstyled global footer.
 * Displays contract address (from env) and basic project info.
 */

export default function Footer() {
  const contractAddress = process.env.REACT_APP_CONTRACT_ADDRESS || "N/A";
  const network = process.env.REACT_APP_NETWORK_NAME || "Sepolia Testnet";
  const year = new Date().getFullYear();

  return (
    <footer
      style={{
        borderTop: "1px solid #eee",
        padding: "12px 0",
        textAlign: "center",
        marginTop: 40,
        fontSize: 14,
        color: "#555",
      }}
    >
      <div>© {year} SimpleVoting DApp — Academic Project</div>
      <div style={{ marginTop: 4 }}>
        Contract:{" "}
        <span style={{ fontFamily: "monospace" }}>
          {contractAddress !== "N/A" ? contractAddress : "Not configured"}
        </span>
      </div>
      <div style={{ marginTop: 4 }}>Network: {network}</div>
    </footer>
  );
}
