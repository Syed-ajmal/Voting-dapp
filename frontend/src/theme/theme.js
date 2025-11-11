// src/theme/theme.js
import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: { main: "#0b5cff" },
    secondary: { main: "#00c2a8" },
    background: { default: "#f6f8fb" }
  },
  typography: {
    fontFamily: "'Inter', sans-serif"
  }
});

export default theme;
