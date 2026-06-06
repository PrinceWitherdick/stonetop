const _GLYPH_RE = /[○◇◆□]+/g;

export function wrapStonetopGlyphsInEl(container) {
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
		acceptNode: node =>
			node.parentElement?.closest(".stonetop-glyph, .stonetop-move-ref")
				? NodeFilter.FILTER_REJECT
				: NodeFilter.FILTER_ACCEPT,
	});
	const toReplace = [];
	let node;
	while ((node = walker.nextNode())) {
		_GLYPH_RE.lastIndex = 0;
		if (_GLYPH_RE.test(node.textContent)) toReplace.push(node);
	}
	for (const textNode of toReplace) {
		const text = textNode.textContent;
		const frag = document.createDocumentFragment();
		let lastIdx = 0;
		_GLYPH_RE.lastIndex = 0;
		let match;
		while ((match = _GLYPH_RE.exec(text)) !== null) {
			if (match.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
			for (const glyph of match[0]) {
				const span = document.createElement("span");
				span.className = "stonetop-glyph";
				if (glyph === "◇") span.classList.add("stonetop-glyph--diamond");
				else if (glyph === "◆") span.classList.add("stonetop-glyph--diamond-selected");
				span.textContent = glyph;
				frag.appendChild(span);
			}
			lastIdx = match.index + match[0].length;
		}
		if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
		textNode.parentNode?.replaceChild(frag, textNode);
	}
}
