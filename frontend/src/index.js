// src/index.js
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { WalletProvider } from "./context/WalletContext";
import { ThemeProvider } from "./context/ThemeContext";
import "./styles/main.scss";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <WalletProvider /* optional: requiredChainId="0xaa36a7" */>
        <App />
      </WalletProvider>
    </ThemeProvider>
  </React.StrictMode>
);
