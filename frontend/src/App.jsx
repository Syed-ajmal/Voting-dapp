// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import Home from "./pages/Home";
import Create from "./pages/Create";
import Vote from "./pages/Vote";
import Results from "./pages/Results";
import AdminControl from "./components/AdminControl";
import PausedBanner from "./components/PausedBanner";
import Footer from "./components/Footer";

function NotFound() {
  return (
    <div style={{ padding: 12 }}>
      <h2>Page not found</h2>
      <p>The page you're looking for doesn't exist.</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <PausedBanner />
      <NavBar />
      <div style={{ padding: 12 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<Create />} />
          <Route path="/vote" element={<Vote />} />
          <Route path="/results" element={<Results />} />
          <Route path="/admin" element={<AdminControl />} />
        </Routes>
      </div>
      <Footer />
    </BrowserRouter>
  );
}
