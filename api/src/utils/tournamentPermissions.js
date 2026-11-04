import { editorsRepository } from "../repositories/editors.repository.js";
import { AppError } from "../errors.js";

// Who may do what on a tournament. This table is the one source of truth, and
// each role holds everything the role before it does. See docs/decisions.md.
//
// A role is held per tournament. The organiser's comes from
// tournaments.created_by and is never stored; the others are
// tournament_editors.role, which is what users see as a collaborator's role.
export const ORGANISER = "ORGANISER";
export const CO_ORGANISER = "CO_ORGANISER";
export const MATCH_MANAGER = "MATCH_MANAGER";
export const SCORER = "SCORER";

// What an organiser can give someone. Organiser is not among them: it comes from
// created_by and cannot be granted.
export const ASSIGNABLE_ROLES = [SCORER, MATCH_MANAGER, CO_ORGANISER];

const SCORER_GRANTS = ["enterCurrentRoundResults"];

const MATCH_MANAGER_GRANTS = [
    ...SCORER_GRANTS,
    // Any round not yet locked. A progressed round is locked for everyone, the
    // organiser included: see assertRoundNotLocked in fixtures.service.js.
    "enterAnyRoundResults",
    "progressRounds",
    "editSchedule",
    // Scoresheets are generated in the browser, so there is nothing for the
    // server to refuse. This only decides what the client offers.
    "printScoresheets"
];

const CO_ORGANISER_GRANTS = [...MATCH_MANAGER_GRANTS, "manageSetup"];

const ORGANISER_GRANTS = [...CO_ORGANISER_GRANTS, "manageCollaborators", "deleteTournament"];

const GRANTS = {
    [SCORER]: SCORER_GRANTS,
    [MATCH_MANAGER]: MATCH_MANAGER_GRANTS,
    [CO_ORGANISER]: CO_ORGANISER_GRANTS,
    [ORGANISER]: ORGANISER_GRANTS
};

// How a role reads where it is shown beside someone's name.
export const ROLE_LABELS = {
    [SCORER]: "scorer",
    [MATCH_MANAGER]: "match manager",
    [CO_ORGANISER]: "co-organiser",
    [ORGANISER]: "organiser"
};

// Every capability as a boolean. No role at all is every capability false.
export function capabilitiesFor(role) {
    const granted = GRANTS[role] ?? [];

    return Object.fromEntries(ORGANISER_GRANTS.map((capability) => [capability, granted.includes(capability)]));
}

// The role this user holds on this tournament, or null if they hold none. Only a
// signed-in user who is not the organiser costs a query.
export async function resolveRole(tournamentId, createdBy, userId) {
    if (!userId) {
        return null;
    }

    if (userId === createdBy) {
        return ORGANISER;
    }

    return editorsRepository.getRole(tournamentId, userId);
}

// requireAuth proves the caller is logged in. This proves they may do this. A
// stranger and a collaborator get different refusals, because only the second
// has a role that could explain it.
export function assertCan(role, capability) {
    if (!role) {
        throw new AppError("NOT_TOURNAMENT_OWNER");
    }

    if (!capabilitiesFor(role)[capability]) {
        throw new AppError("ROLE_NOT_PERMITTED");
    }
}
