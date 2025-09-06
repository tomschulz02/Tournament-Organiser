import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import App from './App';
import Home from './pages/Home';
import Browse from './pages/Browse';
import ViewPage from './pages/View';
import About from './pages/About';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import LegalPage from './pages/Legal';
import ScrollToTop from './components/ScrollToTop';
import { AuthProvider } from './AuthContext';
import { MessageProvider } from './MessageContext';
import { ConfirmProvider } from './components/ConfirmDialog';
import { ThemeProvider } from './ThemeContext';
import '@fortawesome/fontawesome-free/css/all.min.css';

import reportWebVitals from './reportWebVitals';

function RoutesComponent() {
	return (
		<BrowserRouter>
			<ScrollToTop />
			<Routes>
				<Route path="/" element={<App />}>
					<Route path="/" element={<Home />} />
					<Route path="/home" element={<Home />} />
					<Route path="/tournaments" element={<Browse />}>
						<Route path="/tournaments/view/:id" element={<ViewPage />} />
					</Route>
					<Route path="/about" element={<About />} />
					<Route path="/terms" element={<LegalPage />} />
					<Route path="*" element={<NotFound />} />
				</Route>
				<Route path="/login" element={<Login />} />
			</Routes>
		</BrowserRouter>
	);
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
	<React.StrictMode>
		<ThemeProvider>
			<MessageProvider>
				<AuthProvider>
					<ConfirmProvider>
						<RoutesComponent />
					</ConfirmProvider>
				</AuthProvider>
			</MessageProvider>
		</ThemeProvider>
	</React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
// reportWebVitals(console.log);
