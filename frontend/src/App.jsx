// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar";
import Home from "./pages/Home";
import Create from "./pages/Create";
import Vote from "./pages/Vote";
import Results from "./pages/Results";
import About from "./pages/About";
import AdminControl from "./components/AdminControl";
import AdminRoute from "./components/AdminRoute";
import PausedBanner from "./components/PausedBanner";
import ProofLookup from "./pages/ProofLookup.jsx";
import Footer from "./components/Footer";
import MerkleGeneratorCSV from "./pages/MerkleGeneratorCSV";

function NotFound() {
  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Page Not Found</h1>
        <p className="page-subtitle">The page you're looking for doesn't exist.</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <PausedBanner />
      <NavBar />
      <div className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/create" element={<AdminRoute><Create /></AdminRoute>} />
          <Route path="/vote" element={<Vote />} />
          <Route path="/results" element={<Results />} />
          <Route path="/admin" element={<AdminRoute><AdminControl /></AdminRoute>} />
          <Route path="/merkle" element={<AdminRoute><MerkleGeneratorCSV /></AdminRoute>} />
          <Route path="/proof-lookup" element={<ProofLookup/>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      <Footer />
    </BrowserRouter>
  );
}
