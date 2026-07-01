import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Giris from './Giris';
import AnaSayfa from './AnaSayfa';
import IlanVer from './IlanVer';
import Dogrula from './Dogrula';
import Kayit from './Kayit';    
import Profil from './Profil';
import Ilanlarim from './Ilanlarim';
import IlanDetay from './IlanDetay';
import Arkadaslar from './Arkadaslar';
import ArkadasIstekleri from './ArkadasIstekleri';
import Sohbetler from './Sohbetler';
import SohbetDetay from './SohbetDetay';
import Forum from './Forum';
import ForumKonu from './ForumKonu';






function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));

  // Token değiştiğinde durumu güncellemek için
  useEffect(() => {
    const handleStorageChange = () => {
      setIsLoggedIn(!!localStorage.getItem('token'));
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleCikis = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
  };

  return (
    <Router>
  <Routes>
    {/* Ana Sayfa */}
    <Route 
      path="/" 
      element={isLoggedIn ? <AnaSayfa onCikis={handleCikis} /> : <Navigate to="/giris" />} 
    />
    
    {/* Giriş Sayfası */}
    <Route 
      path="/giris" 
      element={!isLoggedIn ? <Giris /> : <Navigate to="/" />} 
    />

    {/* Kayıt Sayfası */}
    <Route path="/kayit" element={<Kayit />} />

    {/* Doğrulama Sayfası */}
    <Route path="/dogrula" element={<Dogrula />} />

    {/* İlan Ver Sayfası */}
    <Route 
      path="/ilan-ver" 
      element={isLoggedIn ? <IlanVer /> : <Navigate to="/giris" />} 
    />

    <Route 
      path="/profil"
      element={isLoggedIn ? <Profil /> : <Navigate to="/giris" />} 
    />

    <Route 
      path="/ilanlarim" 
      element={isLoggedIn ? <Ilanlarim /> : <Navigate to="/giris" />} 
    />

    <Route
      path="/arkadaslar"
      element={isLoggedIn ? <Arkadaslar /> : <Navigate to="/giris" />}
    />

    <Route
      path="/arkadas-istekleri"
      element={isLoggedIn ? <ArkadasIstekleri /> : <Navigate to="/giris" />}
    />

    <Route
      path="/sohbetler"
      element={isLoggedIn ? <Sohbetler /> : <Navigate to="/giris" />}
    />

    <Route
      path="/sohbet/:conversationId"
      element={isLoggedIn ? <SohbetDetay /> : <Navigate to="/giris" />}
    />

    <Route
      path="/forum"
      element={isLoggedIn ? <Forum /> : <Navigate to="/giris" />}
    />

    <Route
      path="/forum/konu/:threadId"
      element={isLoggedIn ? <ForumKonu /> : <Navigate to="/giris" />}
    />

    <Route path="/ilan/:id" element={<IlanDetay />} />

  </Routes>
</Router>
  );
}

export default App;