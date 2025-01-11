window.addEventListener('scroll', () => {
    const header = document.querySelector('header');
    if (window.scrollY > 25) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
});

function openProfile(){
    event.preventDefault(); // Prevent default link behavior
    document.getElementById('profileTab').style.display = 'block';
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