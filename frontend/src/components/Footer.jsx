// src/components/Footer.jsx
import React from "react";

/**
 * Footer Component
 * Displays contract address (from env) and basic project info.
 */

export default function Footer() {
  const contractAddress = process.env.REACT_APP_CONTRACT_ADDRESS || "N/A";
  const network = process.env.REACT_APP_NETWORK_NAME || "Sepolia Testnet";
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-container">
        <div className="footer-text">© {year} SimpleVoting DApp — Academic Project</div>
        <div className="footer-text">
          Contract:{" "}
          <span className="footer-address">
            {contractAddress !== "N/A" ? contractAddress : "Not configured"}
          </span>
        </div>
        <div className="footer-text">Network: {network}</div>
      </div>
    </footer>
  );
}
