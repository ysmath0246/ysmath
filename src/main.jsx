import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// ✅ PWA 서비스워커 등록 (설치 버튼/업데이트에 필요)
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });

// #root에 React 앱 렌더
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
