import React from "react";
import "../styles/LoadingScreen.css";

function LoadingScreen() {
	return (
		<div className="loading-container">
			<div className="lds-ring-container">
				<div className="lds-ring">
					<div></div>
					<div></div>
					<div></div>
					<div></div>
				</div>
			</div>
		</div>
	);
}

export default LoadingScreen;
