import { Link } from 'react-router-dom';
import '../App.css';

// A stopgap destination for links that already exist in the UI before the
// feature behind them does — Profile and Settings, reached from the account
// menu. Not a 404: the route is real and reachable, the page just isn't built
// yet. Reuses NotFound's container and button styling rather than a second
// "empty state" class family for what is structurally the same layout.
export default function NotYetImplemented({ title = 'This page' }) {
	return (
		<div className="not-found-container">
			<h2>{title} isn't ready yet</h2>
			<p>This part of Tourganiser is still being built. Check back soon.</p>
			<Link to="/" className="home-button">
				Return Home
			</Link>
		</div>
	);
}
