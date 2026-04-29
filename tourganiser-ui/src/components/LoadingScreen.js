import React from 'react';
import '../App.css';

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
