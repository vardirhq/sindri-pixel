// Entry point for the standalone AI Pixel-Art Downscaler web app.
//
// This build ships only the reconstruction pipeline and its own UI — none of
// the editor, and nothing that touches Tauri. It is a static page (GitHub
// Pages) that does all of its work client-side.

import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import '../src/styles/tokens.css';
import './styles.css';
import { DownscaleApp } from './DownscaleApp';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DownscaleApp />
  </React.StrictMode>
);
