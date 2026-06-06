const STONETOP_NAMES = [
	"Aderyn", "Aeronwen", "Afanen", "Afon", "Alun", "Andras", "Aneirin", "Awstin",
	"Bedwyr", "Berwyn", "Betrys", "Braith", "Briallen", "Bronwen", "Bryn",
	"Cadi", "Cadoc", "Cadwygan", "Caron", "Cefin", "Ceinwen", "Ceridwyn", "Cerys", "Colwyn",
	"Deiniol", "Dilwen", "Dylis",
	"Eifion", "Eirlys", "Eluned", "Emrys", "Enfys", "Eurwen",
	"Gaenor", "Garet", "Gethin", "Glyndir",
	"Heledd", "Hywel",
	"Ifan", "Iorwerth", "Iwan",
	"Lewela", "Leuca", "Linos",
	"Mado", "Maldwyn", "Malon", "Mared", "Marged", "Martyn", "Meirion", "Menwen", "Mererid",
	"Neirin", "Nia",
	"Ofydd", "Olwyn", "Owain",
	"Padrig", "Parry", "Pryce", "Pryder",
	"Rheinal", "Rhisiart", "Rhosyn", "Rydderch",
	"Sawyl", "Siana", "Sioned",
	"Talfryn", "Tegid", "Tiwlip", "Tomos", "Tudyr",
	"Winifred", "Yorath",
];

const NEIGHBOR_NAMES = [
	// Marshedge / The Steplands
	"Abben", "Ailen", "Brin", "Brogan", "Catlin", "Coln", "Daedre", "Dermos",
	"Ennin", "Finnen", "Gilor", "Isbeal", "Kiran", "Lile", "Lim", "Mathuin",
	"Mirne", "Noren", "Owan", "Ragan", "Renan", "Seadha", "Seann", "Tierney", "Ulliam",
	// Lygos and points south
	"Agatte", "Aref", "Alix", "Baraz", "Canan", "Darya", "Demetra", "Elene",
	"Elios", "Fotios", "Faruza", "Golza", "Iasos", "Iona", "Kyriakos", "Marika",
	"Maayan", "Osher", "Natasa", "Nivola", "Rinat", "Stamat", "Thecla", "Zhaleh",
	// Barrier Pass / The Manmarch
	"Adm", "Blej", "Cirl", "Davth", "Elst", "Gwilm", "Gwenl", "Henri", "Ines",
	"Jenfir", "Jown", "Juda", "Kiln", "Laurl", "Loic", "Merrn", "Maikl", "Nanzl",
	"Nolwn", "Quent", "Reegn", "Ropr", "Sabi", "Stren", "Yanz",
];

const OCCUPATIONS = [
	"baker", "beekeeper", "blacksmith", "bonesetter", "brewer", "butcher",
	"carpenter", "chandler", "charcoal burner", "cobbler", "cook", "cooper",
	"ditchdigger", "dyer",
	"falconer", "farmer", "fisherman", "fletcher", "forester", "fuller",
	"glassblower", "grave digger", "guard",
	"harness maker", "healer", "herbalist", "homemaker", "hunter",
	"innkeep",
	"laundress", "leatherworker",
	"mason", "merchant", "midwife", "miller",
	"ostler",
	"peddler", "porter", "potter", "priest", "publican",
	"ropemaker",
	"saddler", "scribe", "shepherd", "shrine keeper", "smith", "spinner", "stable hand", "stonecutter",
	"tanner", "thatcher", "tinker", "trapper",
	"watchman", "weaver", "wheelwright", "woodcarver", "woodcutter",
];

const TRAITS = [
	"all thumbs", "ambitious", "beautiful singing voice", "beloved by everyone",
	"best cook", "best weaver", "blind", "braved the Ruined Tower",
	"cautious", "cheery", "chronic cough", "complains too much", "cowardly",
	"craves recognition", "curious", "dallied with the Fae years ago", "deaf",
	"desperately wants a child", "distills the best whisky", "doesn't pull their weight",
	"drunkard", "eagle-eye", "fearless", "foundling", "gathers herbs from the Wood",
	"gets the best deals", "gifted storyteller", "gods-fearing", "good with children",
	"happy-go-lucky", "has a beef with Marshedge", "has a good heart",
	"has a lot of backbone", "has a wandering eye", "has a way with animals",
	"has Fae blood in their veins", "has just terrible luck", "has lost their nerve",
	"has no respect for their elders", "has terrible nightmares", "has the most children",
	"has their head in the clouds", "hates the Hillfolk", "hears voices", "humorless",
	"immaculate appearance", "jealous", "just got married", "keeps to themselves",
	"knows all the gossip", "lame", "likes to hurt things", "lived among the Forest Folk",
	"lost all their children", "lovesick", "loves their dogs", "loyal friend",
	"most handsome", "moved here recently", "must approve any marriages", "mute",
	"not afraid of deep water", "not too bright", "oldest orphan", "overprotective",
	"prettiest", "prideful", "reckless", "refuses to marry", "resents their lot in life",
	"runs everywhere", "sensitive", "simpleton", "slew many crinwin", "stoic",
	"stubborn", "suffers from fits", "swears they met the Pale Hunter",
	"tells the best jokes", "tender-hearted", "tends the Gods' Pavilion",
	"tends to the sick & injured", "touched", "very strong", "wants to have kids",
	"well-read", "well-traveled", "widowed", "will eat anything",
];

const HOMES = [
	"Stonetop", "Marshedge", "Gordin's Delve", "The Steplands",
	"Lygos", "Barrier Pass", "The Manmarch",
];

export class AddSteadingMemberDialog extends Application {
	constructor(type, onConfirm, options = {}) {
		super(options);
		this._type = type;
		this._onConfirm = onConfirm;
		this._formData = { name: "", occupation: "", traits: "", relations: "", notes: "" };
		if (type === "neighbor") this._formData.home = "";
	}

	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			template: "systems/stonetop_pwd/templates/dialogs/add-steading-member.hbs",
			width: 460,
			height: "auto",
			resizable: false,
			classes: ["stonetop", "stonetop-add-member-dialog"],
		});
	}

	get title() {
		return this._type === "neighbor" ? "Add Neighbor" : "Add Resident";
	}

	getData() {
		return {
			isNeighbor: this._type === "neighbor",
			names: this._type === "neighbor" ? NEIGHBOR_NAMES : STONETOP_NAMES,
			occupations: OCCUPATIONS,
			traits: TRAITS,
			homes: HOMES,
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		const root = html[0];

		root.querySelectorAll(".asm-input, .asm-select").forEach(el => {
			el.addEventListener("change", () => {
				this._formData[el.name] = el.value;
			});
		});

		root.querySelector(".asm-confirm")?.addEventListener("click", () => {
			if (!this._formData.name.trim()) {
				ui.notifications?.warn("Name is required.");
				return;
			}
			this._onConfirm({ ...this._formData });
			this.close();
		});

		root.querySelector(".asm-cancel")?.addEventListener("click", () => this.close());
	}
}
