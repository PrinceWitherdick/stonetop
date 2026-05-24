/** Capitalize the first character of a string. */
export function capitalizeFirst(str) {
	return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}
