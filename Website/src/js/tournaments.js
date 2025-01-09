/* filepath: /js/tournaments.js */
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('tournament-form');
    const slides = document.querySelectorAll('.form-slide');
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');
    const submitBtn = document.getElementById('submitBtn');
    const steps = document.querySelectorAll('.step');
    let currentSlide = 0;

    nextBtn.addEventListener('click', () => {
        if (currentSlide < slides.length - 1) {
            slides[currentSlide].classList.remove('active');
            slides[currentSlide + 1].classList.add('active');
            steps[currentSlide + 1].classList.add('active');
            currentSlide++;
            updateButtons();
        }
    });

    prevBtn.addEventListener('click', () => {
        if (currentSlide > 0) {
            slides[currentSlide].classList.remove('active');
            slides[currentSlide - 1].classList.add('active');
            steps[currentSlide].classList.remove('active');
            currentSlide--;
            updateButtons();
        }
    });

    function updateButtons() {
        prevBtn.style.display = currentSlide === 0 ? 'none' : 'block';
        nextBtn.style.display = currentSlide === slides.length - 1 ? 'none' : 'block';
        submitBtn.style.display = currentSlide === slides.length - 1 ? 'block' : 'none';
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        // Add form submission logic here
        console.log('Form submitted');
    });
});

let format = document.getElementById('format');