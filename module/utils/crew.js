// Does a character's crew meaningfully exist? True when any defining field is set — a name,
// tags, an instinct, a cost, or at least one named individual. Shared by the sheet's follower
// panel and the Expedition outfit readout so the "is there a crew" question is asked one way.
export function crewExists(crew) {
	return !!(crew && (crew.name || crew.tags?.length || crew.instinct || crew.cost || crew.individuals?.length));
}
