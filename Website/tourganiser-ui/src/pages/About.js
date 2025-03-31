import React from 'react'
import "../styles/About.css"

export default function About() {
    return (
        <>
            <section className="about-section">
                <h1>About Us</h1>
                <div className="description">
                    <p>
                        Welcome to Tournament Organiser! We're dedicated to making tournament
                        management simple and efficient for organizers and participants alike.
                    </p>
                </div>
            </section>

            <section className="contact-section">
                <h2>Contact Information</h2>
                <div className="contact-details">
                    <div className="contact-item">
                        <h3>Email</h3>
                        <p>
                            <a href="mailto:contact@tournamentorganiser.com"
                                >contact@tournamentorganiser.com</a
                            >
                        </p>
                    </div>
                    <div className="contact-item">
                        <h3>Phone</h3>
                        <p>(555) 123-4567</p>
                    </div>
                    <div className="contact-item">
                        <h3>Address</h3>
                        <p>
                            123 Tournament Street<br />
                            City, State 12345<br />
                            Country
                        </p>
                    </div>
                    <div className="social-media">
                        <h3>Follow Us</h3>
                        <a href="/about" target="_blank">Facebook</a>
                        <a href="/about" target="_blank">Twitter</a>
                        <a href="/about" target="_blank">LinkedIn</a>
                    </div>
                </div>
            </section>
        </>
    )
}