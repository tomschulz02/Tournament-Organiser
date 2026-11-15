import { ROLES, ROLE_CAPABILITIES } from './collaboratorRoles';

// What each collaborator role allows, as a grid. Shown in the help's
// Tournament settings topic (table 'roleCapabilities'), not on the Settings
// page: it moved there under docs/handover-help-and-less-text.md.
export default function RoleGrid() {
	const rank = (value) => ROLES.findIndex((role) => role.value === value);

	return (
		<div className="tv-role-grid-wrap">
			<table className="tv-role-grid">
				<thead>
					<tr>
						<th scope="col" className="tv-role-grid-what">
							<span className="tv-visually-hidden">What they can do</span>
						</th>
						{ROLES.map((role) => (
							<th key={role.value} scope="col">
								{role.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{ROLE_CAPABILITIES.map((capability) => (
						<tr key={capability.label}>
							<th scope="row" className="tv-role-grid-what">
								{capability.label}
							</th>
							{ROLES.map((role) => {
								const allowed = rank(role.value) >= rank(capability.from);
								return (
									<td key={role.value} className={allowed ? 'tv-role-grid-yes' : 'tv-role-grid-no'}>
										<span aria-hidden="true">{allowed ? '✓' : '–'}</span>
										<span className="tv-visually-hidden">{allowed ? 'Yes' : 'No'}</span>
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
