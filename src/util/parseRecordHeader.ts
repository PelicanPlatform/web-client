/**
 * Parse a http header that is composed of key=value pairs separated by commas
 * @param header
 */
function parseRecordHeader<T extends Record<string, string>>(header: string | null): any {

	// If header is null, return undefined
	if(header === null || header.trim() === ""){
		return undefined
	}

	// If the header is not in the expected format, log it and return undefined
	if(!header.includes("=")) {
		console.warn(`Header not in expected format: ${header}\n\tkey=value[, key=value...]]`)
		return undefined
	}

	return header.split(",").reduce((a, s) => {

		// Split the records in form key=value and add them to the object
		let [key, value] = s.split("=").map(x => x.trim())
		a[key] = value
		return a

	}, {} as Record<string, string>) as T
}

export default parseRecordHeader;
