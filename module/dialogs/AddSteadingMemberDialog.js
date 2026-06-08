import { KeepOnTop } from "../utils/keep-on-top.js";

const HOME_INFO_DIALOG_CLASS = "stonetop-asm-child-dialog";

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

const MARSHEDGE_NAMES = [
	"Abben", "Ailen", "Brin", "Brogan", "Catlin", "Coln", "Daedre", "Dermos",
	"Ennin", "Finnen", "Gilor", "Isbeal", "Kiran", "Lile", "Lim", "Mathuin",
	"Mirne", "Noren", "Owan", "Ragan", "Renan", "Seadha", "Seann", "Tierney", "Ulliam",
];

const STEPLANDS_NAMES = [
	"Adm", "Blej", "Cirl", "Davth", "Elst", "Gwilm", "Gwenl", "Henri", "Ines",
	"Jenfir", "Jown", "Juda", "Kiln", "Laurl", "Loic", "Merrn", "Maikl", "Nanzl",
	"Nolwn", "Quent", "Reegn", "Ropr", "Sabi", "Stren", "Yanz",
];

const LYGOS_NAMES = [
	"Agatte", "Aref", "Alix", "Baraz", "Canan", "Darya", "Demetra", "Elene",
	"Elios", "Fotios", "Faruza", "Golza", "Iasos", "Iona", "Kyriakos", "Marika",
	"Maayan", "Osher", "Natasa", "Nivola", "Rinat", "Stamat", "Thecla", "Zhaleh",
];

const NEIGHBOR_NAMES_BY_HOME = {
	"Marshedge": MARSHEDGE_NAMES,
	"The Steplands": STEPLANDS_NAMES,
	"Lygos": LYGOS_NAMES,
};

// Per the Steading playbook's "Notable neighbors" reference, name lists are only
// given for Marshedge, the Steplands, and Lygos — everywhere else either has no
// dedicated list ("Other places: Barrier Pass, the Manmarch, etc.") or explicitly
// says to "choose from other lists" (Gordin's Delve, since "everyone comes ...
// from somewhere else"). Those homes fall back to the full combined name pool.
const NEIGHBOR_NAMES = Object.values(NEIGHBOR_NAMES_BY_HOME).flat();

const OCCUPATIONS = [
	"Baker", "Beekeeper", "Blacksmith", "Bonesetter", "Brewer", "Butcher",
	"Carpenter", "Chandler", "Charcoal burner", "Cobbler", "Cook", "Cooper",
	"Ditchdigger", "Dyer",
	"Falconer", "Farmer", "Fisherman", "Fletcher", "Forester", "Fuller",
	"Glassblower", "Grave digger", "Guard",
	"Harness maker", "Healer", "Herbalist", "Homemaker", "Hunter",
	"Innkeep",
	"Laundress", "Leatherworker",
	"Mason", "Merchant", "Midwife", "Miller",
	"Ostler",
	"Peddler", "Porter", "Potter", "Priest", "Publican",
	"Ropemaker",
	"Saddler", "Scribe", "Shepherd", "Shrine keeper", "Smith", "Spinner", "Stable hand", "Stonecutter",
	"Tanner", "Thatcher", "Tinker", "Trapper",
	"Watchman", "Weaver", "Wheelwright", "Woodcarver", "Woodcutter",
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
	"Marshedge", "Gordin's Delve", "The Steplands",
	"Lygos", "Barrier Pass", "The Manmarch",
];

// Short blurbs drawn from the "World's End" setting overview, for the "About
// these places" info button beside the neighbor's Home dropdown.
const HOME_INFO = {
	"Marshedge": "A proper town with a wooden palisade, market, and town council — though the old bandit Brennan and his gang, the Claws, run the watch.",
	"Gordin's Delve": "A rugged mining town in the Huffel Peaks, named for the Maker-made passages that plunge beneath the mountains. Mask-wearing Ustrina sometimes come up from the depths to trade.",
	"The Steplands": "Rugged wilderness roamed by the nomadic Hillfolk — horselords and shepherds, fierce and barbaric to outsiders.",
	"Lygos": "A city far to the south, reached after a long trek through the arid Manmarch. Steady trade flows between Marshedge, Lygos, and the other southern towns.",
	"Barrier Pass": "A mountain stronghold sealed by a massive wall and gate, held by stoic, unfriendly folk who live on goats and sheep and want little to do with strangers.",
	"The Manmarch": "Sparsely settled southern plains, and the feuding, warlike longhouse-dwellers of the north — who'd be a terror to all the world, should they ever unite.",
};

export class AddSteadingMemberDialog extends Application {
	constructor(type, onConfirm, options = {}) {
		super(options);
		this._type = type;
		this._onConfirm = onConfirm;
		this._formData = { name: "", occupation: "", traits: "", relations: "", notes: "" };
		if (type === "neighbor") this._formData.home = "";
		this._keepOnTop = new KeepOnTop(this, { childDialogClass: HOME_INFO_DIALOG_CLASS });
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

	async _render(force, options) {
		await super._render(force, options);
		this._keepOnTop.apply();
	}

	async close(options = {}) {
		this._keepOnTop.stop();
		return super.close(options);
	}

	get title() {
		return this._type === "neighbor" ? "Add Neighbor" : "Add Resident";
	}

	getData() {
		return {
			isNeighbor: this._type === "neighbor",
			names: this._namesForHome(this._formData.home),
			occupations: OCCUPATIONS,
			traits: TRAITS,
			homes: HOMES,
		};
	}

	/** Names available depend on which "Home" is selected — see the Steading playbook's "Notable neighbors" reference. */
	_namesForHome(home) {
		if (this._type !== "neighbor") return STONETOP_NAMES;
		return NEIGHBOR_NAMES_BY_HOME[home] ?? NEIGHBOR_NAMES;
	}

	_showHomeInfo() {
		const entries = HOMES.map(home => `
			<div class="stonetop-asm-home-info-entry">
				<h3>${home}</h3>
				<p>${HOME_INFO[home] ?? ""}</p>
			</div>`).join("");
		new Dialog({
			title: "Notable Places",
			content: `<div class="stonetop-asm-home-info">${entries}</div>`,
			buttons: { close: { label: "Close" } },
			default: "close",
		}, { width: 480, classes: ["dialog", "stonetop-asm-home-info-dialog", HOME_INFO_DIALOG_CLASS] }).render(true);
	}

	_refreshNameOptions(root) {
		const select = root.querySelector('.asm-select[name="name"]');
		if (!select) return;
		const names = this._namesForHome(this._formData.home);
		const current = select.value;
		select.replaceChildren(new Option("— choose a name —", ""), ...names.map(n => new Option(n, n)));
		select.value = names.includes(current) ? current : "";
		this._formData.name = select.value;
	}

	activateListeners(html) {
		super.activateListeners(html);
		this._keepOnTop.start();
		const root = html[0];

		root.querySelectorAll(".asm-input, .asm-select").forEach(el => {
			el.addEventListener("change", () => {
				this._formData[el.name] = el.value;
			});
		});

		// The pool of names depends on which "Home" is selected (see the Steading
		// playbook's "Notable neighbors" reference) — refilter when it changes.
		root.querySelector('.asm-select[name="home"]')?.addEventListener("change", () => {
			this._refreshNameOptions(root);
		});

		root.querySelector(".asm-info[data-info='home']")?.addEventListener("click", () => this._showHomeInfo());

		root.querySelectorAll(".asm-randomize").forEach(btn => {
			btn.addEventListener("click", () => {
				const select = root.querySelector(`.asm-select[name="${btn.dataset.target}"]`);
				if (!select) return;
				const options = Array.from(select.options).filter(o => o.value);
				if (!options.length) return;
				select.value = options[Math.floor(Math.random() * options.length)].value;
				select.dispatchEvent(new Event("change"));
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
