window.addEventListener('scroll', () => {
    const header = document.querySelector('header');
    if (window.scrollY > 25) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
});

function openProfile(){
    // event.preventDefault(); // Prevent default link behavior
    document.getElementById('profileTab').style.display = 'flex';
}

function closeProfile(){
    // event.preventDefault(); // Prevent default link behavior
    const profile = document.getElementById('profileTab');
    profile.classList.add('closing');

    setTimeout(() => {
        profile.style.display = 'none';
        profile.classList.remove('closing');
    }, 280);
}

window.addEventListener('click', (event) => {
    if (event.target === document.getElementById('profileTab')) {
        closeProfile();
    }
});

function openLogin(){
    document.getElementById('profileTab').style.display = 'none';
    document.getElementById('loginPopup').style.display = 'flex';
}

function closeLogin(){
    document.getElementById('loginPopup').style.display = 'none';
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitButton = e.target.querySelector('button');
    try {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        // Show loading state
        submitButton.disabled = true;
        submitButton.textContent = 'Logging in...';
        
        const result = await loginUser(email, password);

        console.log(result);
        
        if (result.success) {
            // Handle successful login
            console.log('Login successful');
            document.getElementById('loginPopup').style.display = 'none';
            // change text from Login to Logout in profile window
        }
    } catch (error) {
        // Show error message to user
        alert(error.message);
    } finally {
        // Reset button state
        submitButton.disabled = false;
        submitButton.textContent = 'Login';
    }
});

function openSignup() {
    document.getElementById('signupPopup').style.display = 'flex';
    document.getElementById('loginPopup').style.display = 'none';
}

function closeSignup() {
    document.getElementById('signupPopup').style.display = 'none';
}

function toggleForms() {
    const loginPopup = document.getElementById('loginPopup');
    const signupPopup = document.getElementById('signupPopup');
    
    if (loginPopup.style.display === 'flex') {
        loginPopup.style.display = 'none';
        signupPopup.style.display = 'flex';
    } else {
        loginPopup.style.display = 'flex';
        signupPopup.style.display = 'none';
    }
}

document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    try {
        const email = document.getElementById('newEmail').value;
        const password = document.getElementById('newPassword').value;
        const username = document.getElementById('newUsername').value;
        
        // Show loading state
        const submitButton = e.target.querySelector('button');
        submitButton.disabled = true;
        submitButton.textContent = 'Logging in...';
        
        const result = await signupUser(username, email, password);
        
        if (result.success) {
            // Handle successful login
            document.getElementById('signupPopup').style.display = 'none';
        }
    } catch (error) {
        // Show error message to user
        alert(error.message);
    } finally {
        // Reset button state
        submitButton.disabled = false;
        submitButton.textContent = 'Login';
    }
});

async function loginUser(email, password) {
    try {
        const response = await fetch('http://localhost:3030/api/signin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
            credentials: 'include' // needed for cookies
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        return data;
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

async function signupUser(username, email, password) {
    try {
        const response = await fetch('http://localhost:3030/api/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({username, email, password}),
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok){
            throw new Error(data.error || 'Failed to create account');
        }

        return data;
    } catch (error){
        console.error('Signup error:', error);
        throw error;
    }
}