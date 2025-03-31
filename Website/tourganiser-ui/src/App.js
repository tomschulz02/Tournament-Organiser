import './App.css';
import { Outlet, Link } from "react-router-dom";


export default function App() {
  return (
    <>
    <Header />
    <main id="app">
      <Outlet />
    </main>
    <Footer />
    </>
  );
}

function Header(){
  return (
    <header id="header">
			<h1>Tourganiser</h1>
			<nav>
				<ul>
					<Link to="/" className="nav-links">Home</Link>
          <Link to="/tournaments" className="nav-links">Tournaments</Link>
          <Link to="/about" className="nav-links">About</Link>
					<a onclick="openProfile()" className='nav-links'>Profile</a>
				</ul>
			</nav>
		</header>
  )
}

function Footer(){
  return (
    <footer id="footer" class="site-footer">
			<div class="footer-content">
				<div class="footer-section">
					<h4>Quick Links</h4>
					<nav>
						<Link to="/" className="nav-links">Home</Link>
            <Link to="/tournaments" className="nav-links">Tournaments</Link>
            <Link to="/about" className="nav-links">About</Link>
					</nav>
				</div>
				<div class="footer-section">
					<h4>Connect With Us</h4>
					<div class="social-links">
						<a href="/" target='_blank' rel='noreferror'><i class="fab fa-discord"></i> Discord</a>
						<a href="https://github.com/tomschulz02/Tournament-Organiser" target='_blank' rel='noreferror'><i class="fab fa-github"></i> GitHub</a>
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
					<a href="/">Privacy Policy</a>
					<a href="/">Terms of Service</a>
				</div>
			</div>
		</footer>
  )
}

window.addEventListener('scroll', () => {
    const header = document.querySelector('header');
    if (window.scrollY > 25) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }
});