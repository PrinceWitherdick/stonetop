import { ResourceDef } from "./Resource.js";
import { normalizeRollType } from "../utils/roll-types.js";

export class MoveDefinition {
	constructor(data) {
		this.id          = data._id;
		this.name        = data.name;
		this.playbook    = data.system?.playbook        ?? null;
		this.rollType    = normalizeRollType(data.system?.rollType);
		this.description = data.system?.description     ?? null;
		this.isStarting  = data.system?.isStartingMove  ?? false;
		this.requirement = data.system?.requirement     ?? null;
		this.repeatMax   = data.system?.repeatMax       ?? null;
		this.resource    = data.system?.resource ? new ResourceDef(data.system.resource) : null;
	}
}
