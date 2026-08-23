// The one rule the tournament view keeps asking: has this tournament started?
//
// A null status is Not Started. That is not a defensive default — it is what the
// server does with one, in statusOf in api/src/services/tournaments.service.js,
// and rows created before status had a default still carry null.
//
// Its own file because the lint config forbids a module exporting both a
// component and a plain function (react-refresh/only-export-components), so it
// cannot ride along in TeamsTab.jsx or OverviewTab.jsx and be imported from the
// other. It is not in fixtureUtils.js because that module is about fixtures.
//
// Composition — adding, removing and reordering teams, adding and removing
// divisions — is only possible while this is true, and the controls for it are
// hidden rather than disabled once it is not. The server still refuses each one
// with a 409; hiding is presentation, never enforcement. See docs/decisions.md.
export function isNotStarted(status) {
	return (status ?? 'Not Started') === 'Not Started';
}
