import "../styles/Home.css";
import React from "react";

export default function Home() {
    return (
        <div className="home">
            <section className="donation-banner">
                <div className="banner-content">
                    <h3>Support Tourganiser's Development</h3>
                    <p>Help us improve and add new features by making a donation</p>
                </div>
                <a href="#donate" className="donate-button">Make a Donation</a>
            </section>

            <section id="home">
                <h2>Welcome to Tourganiser</h2>
                <p>Plan your next tournament with ease.</p>
            </section>

            <section id="features" className="features-section">
                <h2 className="section-title">Features</h2>
                <div className="features-grid">
                    <div className="feature-card">
                        <div className="feature-image"></div>
                        <div className="feature-content">
                            <h3 className="feature-title">Tournament Creation</h3>
                            <p className="feature-description">
                                Create and manage tournaments with just a few clicks. Set up brackets,
                                rounds, and schedules effortlessly.
                            </p>
                        </div>
                    </div>
                    <div className="feature-card">
                        <div className="feature-image"></div>
                        <div className="feature-content">
                            <h3 className="feature-title">Player Management</h3>
                            <p className="feature-description">
                                Keep track of participants, teams, and their statistics. Manage
                                registrations and check-ins smoothly.
                            </p>
                        </div>
                    </div>
                    <div className="feature-card">
                        <div className="feature-image"></div>
                        <div className="feature-content">
                            <h3 className="feature-title">Live Updates</h3>
                            <p className="feature-description">
                                Real-time score updates and bracket progression. Keep everyone
                                informed with instant notifications.
                            </p>
                        </div>
                    </div>
                    <div className="feature-card">
                        <div className="feature-image"></div>
                        <div className="feature-content">
                            <h3 className="feature-title">Custom Rules</h3>
                            <p className="feature-description">
                                Define your own tournament rules and formats. Support for various
                                competition styles and scoring systems.
                            </p>
                        </div>
                    </div>
                    <div className="feature-card">
                        <div className="feature-image"></div>
                        <div className="feature-content">
                            <h3 className="feature-title">Analytics</h3>
                            <p className="feature-description">
                                Get detailed insights and statistics. Track performance metrics and
                                generate comprehensive reports.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}