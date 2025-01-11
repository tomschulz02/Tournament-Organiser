function loadPage(){
    addHeader();
    addFooter();
}

function addHeader(){
    const header = document.createElement('header');
    header.innerHTML = `
        <h1>Tourganiser</h1>
        <nav>
            <ul>
                <a href="index.html">Home</a>
                <a href="tournaments.html">Tournaments</a>
                <a href="about.html">About</a>
                <a href="#" onclick="openProfile()">Profile</a>
            </ul>
        </nav>
    `;
    document.body.appendChild(header);

    const profileTab = document.createElement('div');
    profileTab.id = 'profileTab';
    profileTab.classList.add('profile-tab');
    profileTab.innerHTML = `
            <button class="profile-close-btn" onclick="closeProfile()">&times;</button>
            <div class="profile-content">
                <h2>Profile</h2>
                <div class="profile-item">
                    <h4>My Tournaments</h4>
                </div>
                <div class="profile-item">
                    <h4>Friends</h4>
                </div>
            </div>
    `;
    document.body.appendChild(profileTab);
}

function addFooter(){
    const footer = document.createElement('footer');
    footer.classList.add('site-footer');
    footer.innerHTML = `
        <div class="footer-content">
            <div class="footer-section">
                <h4>Quick Links</h4>
                <nav>
                    <a href="#home">Home</a>
                    <a href="#features">Features</a>
                    <a href="tournaments.html">Tournaments</a>
                    <a href="about.html">About</a>
                </nav>
            </div>
            <div class="footer-section">
                <h4>Connect With Us</h4>
                <div class="social-links">
                    <a href="#"><i class="fab fa-discord"></i> Discord</a>
                    <a href="#"><i class="fab fa-github"></i> GitHub</a>
                </div>
            </div>
            <div class="footer-section">
                <h4>Contact</h4>
                <p>Email: info@tourganiser.com</p>
                <p>Support: support@tourganiser.com</p>
            </div>
        </div>
        <div class="footer-bottom">
            <p>&copy; 2024 Tourganiser. All rights reserved.</p>
            <div class="legal-links">
                <a href="#">Privacy Policy</a>
                <a href="#">Terms of Service</a>
            </div>
        </div>
    `;
    document.body.appendChild(footer);
}