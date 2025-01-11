/* filepath: /js/tournaments.js */
let currentSlide = 0;
let slides = 0;

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('tournament-form');
    slides = document.querySelectorAll('.form-slide');
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');
    const submitBtn = document.getElementById('submitBtn');
    const steps = document.querySelectorAll('.step');

    nextBtn.addEventListener('click', () => {
        if (currentSlide === 0) {
            if (!validateFirstSlide()) {
                return; // Stop if validation fails
            }
        }
        
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

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        // Add form submission logic here
        console.log('Form submitted');
    });

    let format = document.getElementById('format');
    let options = Array.from(format.options).map(option => option.value);
    // options will contain: ['single', 'double', 'round', 'combi']
    let selectedFormat = format.value;

    // hide all descriptions but the default selected one
    options.forEach(opt => {
        document.getElementById(opt).style.display = 'none';
    });
    document.getElementById(selectedFormat).style.display = 'block';

    format.addEventListener('change', () => {
        selectedFormat = format.value;
        console.log(selectedFormat=== 'combi');
        // hide all descriptions but the selected one
        options.forEach(opt => {
            document.getElementById(opt).style.display = 'none';
        });
        document.getElementById(selectedFormat).style.display = 'block';

        // if the selected format is 'combi', show the combi options
        if (selectedFormat === 'combi') {
            document.getElementById('groupCount').classList.toggle('hidden');
            document.getElementById('knockout').classList.toggle('hidden');
            document.getElementById('teamsPerGroup').toggleAttribute('required');
            document.getElementById('knockoutRound').toggleAttribute('required');
        } else {
            document.getElementById('groupCount').classList.toggle('hidden');
            document.getElementById('knockout').classList.toggle('hidden');
            document.getElementById('teamsPerGroup').toggleAttribute('required');
            document.getElementById('knockoutRound').toggleAttribute('required');
        }
    });

    // Tab switching logic
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });

    // Search functionality
    const searchInput = document.getElementById('searchTournaments');
    const formatFilter = document.getElementById('filterFormat');

    searchInput.addEventListener('input', filterTournaments);
    formatFilter.addEventListener('change', filterTournaments); 

    // Tab switching functionality
    document.querySelectorAll('.view-tab-btn').forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and panes
            document.querySelectorAll('.view-tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
            
            // Add active class to clicked button and corresponding pane
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });
});

function openPopup(tournamentId) {
    document.getElementById('tournamentPopup').style.display = 'block';
    // Load tournament data based on tournamentId
    loadTournamentData(tournamentId);
}

function closePopup() {
    const popup = document.getElementById('tournamentPopup');
    popup.classList.add('closing');
    
    // Wait for animation to complete before hiding
    setTimeout(() => {
        popup.style.display = 'none';
        popup.classList.remove('closing');
    }, 600); // Match animation duration
}

function loadTournamentData(tournamentId) {
// TODO: load tournament data based on tournamentId
}

// Tab switching functionality
document.querySelectorAll('.view-tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        // Remove active class from all buttons and panes
        document.querySelectorAll('.view-tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        
        // Add active class to clicked button and corresponding pane
        button.classList.add('active');
        const tabId = button.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
    });
});

// Close popup when clicking outside
window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('tournamentPopup')) {
        closePopup();
    }
});

function validateFirstSlide() {
    const tournamentName = document.getElementById('tournamentName').value;
    const startDate = document.getElementById('startDate').value;
    const location = document.getElementById('location').value;
    
    // Check if required fields are filled
    if (!tournamentName || !startDate || !location) {
        // Add error class to empty required fields
        if (!tournamentName) document.getElementById('tournamentName').classList.add('error');
        if (!startDate) document.getElementById('startDate').classList.add('error');
        if (!location) document.getElementById('location').classList.add('error');
        return false;
    }
    
    return true;
}

function updateButtons() {
    prevBtn.style.display = currentSlide === 0 ? 'none' : 'block';
    nextBtn.style.display = currentSlide === slides.length - 1 ? 'none' : 'block';
    submitBtn.style.display = currentSlide === slides.length - 1 ? 'block' : 'none';
}

function filterTournaments() {
    // Add tournament filtering logic here
}