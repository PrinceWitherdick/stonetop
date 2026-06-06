/**
 * Marks <li> elements whose text content ends with "?" with the
 * "question-bullet" class, so CSS can swap in the question-spiral icon.
 * @param {Element} root
 */
export function markQuestionBullets(root) {
	root.querySelectorAll("li").forEach(li => {
		const text = li.textContent.trim();
		li.classList.toggle("question-bullet", text.endsWith("?"));
	});
}
