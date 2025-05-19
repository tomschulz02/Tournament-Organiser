import React from "react";
import { Link } from "react-router-dom";
import "../styles/NotFound.css";

export default function NotFound() {
    const handleEmailClick = () => {
        window.location.href = "mailto:support@tourganiser.co.za";
    };

    return (
        <div className="not-found-container">
            <h1 className="not-found-title">404</h1>
            <h2>Page Not Found</h2>
            <p>The page you're looking for doesn't exist or has been moved.</p>
            <p>
                If you think you shouldn't be seeing this error, please feel free to email us at{" "}
                <span 
                    className="email-link"
                    onClick={handleEmailClick}
                    role="button"
                    tabIndex={0}
                >
                    support@tourganiser.co.za
                </span>
            </p>
            <Link to="/" className="home-button">
                Return Home
            </Link>
        </div>
    );
}