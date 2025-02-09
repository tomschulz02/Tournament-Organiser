function loadPage(){
    addHeader();
    addFooter();
    addLoginPopups();
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
                <h2>Profile - Username</h2>
                <div class="profile-item no-hover"></div>
                <div class="profile-item">
                    <h4>My Tournaments</h4>
                </div>
                <div class="profile-item">
                    <h4>Friends</h4>
                </div>
                <div class="profile-actions">
                    <div class="profile-actions-settings"></div>
                    <div class="profile-actions-item" onclick="openLogin()">Login</div>
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

function addLoginPopups(){
    const main = document.querySelector('main');
    if (!main) return;

    const loginPopup = document.createElement('div');
    loginPopup.className = 'login-popup';
    loginPopup.id = 'loginPopup';
    loginPopup.innerHTML = `
            <div class="login-container">
                <button class="close-login" onclick="closeLogin()">&times;</button>
                <div class="login-header">
                    <h2>Login</h2>
                </div>
                <form class="login-form" id="loginForm">
                    <div class="form-group">
                        <label for="email">Email</label>
                        <input type="email" autocomplete="email" id="email" required>
                    </div>
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" required>
                    </div>
                    <button type="submit">Login</button>
                </form>
                <div class="login-form-link">
                    Don't have an account yet? Create one <span onclick="toggleForms()"
                        style="color: blue; text-decoration-line: underline; cursor: pointer;">here</span>
                </div>
            </div>`
    
    main.appendChild(loginPopup);

    const signupPopup = document.createElement('div');
    signupPopup.className = 'login-popup';
    signupPopup.id = 'signupPopup';
    signupPopup.innerHTML = `
            <div class="login-container">
                <button class="close-login" onclick="closeSignup()">&times;</button>
                <div class="login">
                    <h2>Create Account</h2>
                </div>
                <form class="login-form" id="signupForm">
                    <div class="form-group">
                        <label for="newUsername">Username</label>
                        <input type="text" autocomplete="username" id="newUsername" required>
                    </div>
                    <div class="form-group">
                        <label for="newEmail">Email</label>
                        <input type="email" autocomplete="email" id="newEmail" required>
                    </div>
                    <div class="form-group">
                        <label for="newPassword">Password</label>
                        <input type="password" autocomplete="new-password" id="newPassword" required>
                    </div>
                    <div class="form-group">
                        <label for="confirmPassword">Confirm Password</label>
                        <input type="password" autocomplete="new-password" id="confirmPassword" required>
                    </div>
                    <button type="submit">Create Account</button>
                </form>
                <div class="login-form-link">
                    Already have an account? <span onclick="toggleForms()"
                        style="color: blue; text-decoration-line: underline; cursor: pointer;">Login here</span>
                </div>
            </div>`

    main.appendChild(signupPopup);
}