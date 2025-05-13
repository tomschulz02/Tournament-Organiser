import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import App from "./App";
import Home from "./pages/Home";
import Tournaments from "./pages/Tournaments";
import TournamentView from "./pages/TournamentView";
import About from "./pages/About";
import Login from "./pages/Login";
import { AuthProvider } from "./AuthContext";
import { MessageProvider } from "./MessageContext";
import { ConfirmProvider } from "./components/ConfirmDialog";
import "@fortawesome/fontawesome-free/css/all.min.css";

import reportWebVitals from "./reportWebVitals";

function RoutesComponent() {
	const [username, setUsername] = useState("Guest");

	return (
		<BrowserRouter>
			<Routes>
				<Route path="/" element={<App username={username} setUsername={setUsername} />}>
					<Route path="/" element={<Home />} />
					<Route path="/home" element={<Home />} />
					<Route path="/tournaments" element={<Tournaments />} />
					<Route path="/tournaments/view/:id" element={<TournamentView />} />
					<Route path="/about" element={<About />} />
				</Route>
				<Route path="/login" element={<Login setUsername={setUsername} />} />
			</Routes>
		</BrowserRouter>
	);
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
	<React.StrictMode>
		<MessageProvider>
			<AuthProvider>
				<ConfirmProvider>
					<RoutesComponent />
				</ConfirmProvider>
			</AuthProvider>
		</MessageProvider>
	</React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals(console.log);
