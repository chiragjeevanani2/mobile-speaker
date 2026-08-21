import { Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme.jsx';
import HomePage from './pages/HomePage.jsx';
import SenderPage from './pages/SenderPage.jsx';
import ReceiverPage from './pages/ReceiverPage.jsx';

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sender" element={<SenderPage />} />
        <Route path="/speaker/:roomId" element={<ReceiverPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </ThemeProvider>
  );
}
