// src/index.js
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { WalletProvider } from "./context/WalletContext"; // path matches file above

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WalletProvider /* optional: requiredChainId="0xaa36a7" */>
      <App />
    </WalletProvider>
  </React.StrictMode>
);
