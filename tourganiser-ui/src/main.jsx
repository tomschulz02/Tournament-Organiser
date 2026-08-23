import './App.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import App from './App';
import Home from './pages/Home';
import Browse from './pages/Browse';
import CreateTournament from './pages/CreateTournament';
import ViewPage from './pages/View';
import About from './pages/About';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import NotYetImplemented from './pages/NotYetImplemented';
import Profile from './pages/Profile';
import LegalPage from './pages/Legal';
import ScrollToTop from './components/ScrollToTop';
import { AuthProvider } from './AuthProvider';
import { MessageProvider } from './MessageProvider';
import { ConfirmProvider } from './components/ConfirmDialog';
import { ThemeProvider } from './ThemeContext';
import { HelpProvider } from './HelpProvider';
import '@fortawesome/fontawesome-free/css/all.min.css';

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
					{/* A page in its own right, not a nested view of Browse. The two
					    share nothing but a URL prefix, and creation living inside
					    Browse behind a hash is why the post-creation redirect
					    appeared to do nothing. */}
					<Route path="/tournaments/create" element={<CreateTournament />} />
					<Route path="/about" element={<About />} />
					<Route path="/terms" element={<LegalPage />} />
					<Route path="/profile" element={<Profile />} />
					{/* Reached from the account menu's Settings item before the page
					    exists — a real, reachable route rather than a 404. */}
					<Route path="/settings" element={<NotYetImplemented title="Settings" />} />
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
						<HelpProvider>
							<RoutesComponent />
						</HelpProvider>
					</ConfirmProvider>
				</AuthProvider>
			</MessageProvider>
		</ThemeProvider>
	</React.StrictMode>
);
